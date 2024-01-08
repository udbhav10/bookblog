import bodyParser from "body-parser";
import pg from 'pg';
import express from "express";
import bcrypt from "bcrypt";
import session from "express-session";
import flash from "express-flash";
import passport from "passport";
import dotenv from "dotenv";
import {
    Strategy as LocalStrategy
} from "passport-local";
import {
    Strategy as GoogleStrategy
} from "passport-google-oauth20";
dotenv.config();

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(express.static("public"));

app.use(
    session({
        secret: "secret",
        resave: false,
        saveUninitialized: false
    })
);
app.use(passport.initialize());
app.use(passport.session());

const pool = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DB,
    password: process.env.DB_PWD,
    port: 5432
});

pool.connect();

const authenticateUser = async (username, password, done) => {
    try {
        const result = await pool.query("select * from users where username = $1", [username]);
        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            return done(null, user);
        } else {

            return done(null, false, {
                message: "Incorrect Password"
            });
        }
    } catch (error) {
        return done(null, false, {
            message: "Username not found"
        });
    }
}

passport.use(
    new LocalStrategy({
            usernameField: "username",
            passwordField: "password"
        },
        authenticateUser
    ));

passport.use(
    new GoogleStrategy({
            clientID: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            callbackURL: "https://bookblog.onrender.com/auth/google/home",
            userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
        },
        function (accessToken, refreshToken, profile, cb) {
            const google_id = profile.id;
            const fname = profile.name.givenName;
            const lname = profile.name.familyName;
            pool.query("select * from users where google_id = $1", [google_id], (err, result) => {
                if (err) {
                    return cb(err);
                } else if (!result.rows.length) {
                    pool.query("insert into users (google_id, fname, lname) values ($1, $2, $3) returning *", [google_id, fname, lname], (err, result) => {
                        if (err) {
                            return cb(err)
                        } else {
                            return cb(null, result.rows[0]);
                        }
                    })
                } else {
                    return cb(null, result.rows[0]);
                }
            });
        }))

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
    pool.query("select * from users where id = $1", [id], (err, results) => {
        if (err) {
            throw err;
        } else {
            return done(null, results.rows[0]);
        }
    });
})

async function fetchData() {
    const result = await pool.query("select * from published");
    const data = result.rows;
    return data;
}

async function fetchDrafts() {
    const result = await pool.query("select * from userdrafts");
    const data = result.rows;
    return data;
}

app.use(flash());
app.get("/", async (req, res) => {
    let data = await fetchData();
    let sortedData = [...data];
    if (req.isAuthenticated()) {
        const user = req.user;
        res.render("index-auth.ejs", {
            user: user,
            data: sortedData.sort((a, b) => b.datepublished.localeCompare(a.datepublished))
        });
    } else {
        res.render("index.ejs", {
            data: sortedData.sort((a, b) => b.datepublished.localeCompare(a.datepublished))
        });
    }
})

app.get("/contact", (req, res) => {
    if (req.isAuthenticated()) {
        res.render("contact-auth.ejs", {
            user: req.user
        });
    } else {
        res.render("contact.ejs");
    }
})

app.get("/reviews", async (req, res) => {
    let data = await fetchData();
    if (req.isAuthenticated()) {
        const user = req.user;
        res.render("reviews-auth.ejs", {
            data: data,
            user: user
        });
    } else {
        res.render("reviews.ejs", {
            data: data
        });
    }
})

app.get("/create", async (req, res) => {
    if (req.isAuthenticated()) {
        res.render("create.ejs", {
            user: req.user
        });
    } else {
        res
            .status(404)
            .send("Unauthorised request");
    }
})

app.post("/create", async (req, res) => {
    if (req.isAuthenticated()) {

        const userid = req.user.id;
        const booktitle = req.body.title.trim() || "<Book Title>"
        const bookauthor = req.body.bookauthor.trim() || "<Book Author>"
        const title = (booktitle + " by " + bookauthor);
        const genre = req.body.genre.trim() || "<Book Genre>";
        const author = req.body.author.trim() || req.user.fname + " " + req.user.lname;
        const isbn10 = req.body.isbn.trim().replaceAll("-", "") || "0000000000";
        const summary = req.body.summary.trim() || "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.";
        const content = req.body.content.trim() || "";
        const rating = parseInt(req.body.rating) || 5;
        const coverlink = 'https://covers.openlibrary.org/b/isbn/' + isbn10 + '-M.jpg';
        const datecreated = new Date().getDate().toString() + "-" + ((new Date().getMonth()) + 1).toString() + "-" + new Date().getFullYear().toString();
        if (isbn10.length != 10 && isbn10.length != 13) {
            const post = {
                title: title,
                genre: genre,
                author: author,
                isbn10: "",
                summary: summary,
                content: content,
                rating: rating
            }
            res.render("create.ejs", {
                user: req.user,
                errorisbn: 1,
                post: post
            });
        } else if (req.body.action == 'saveDraft') {

            await pool.query("insert into userdrafts (userid, title, isbn10, coverlink, genre, author, summary, content, rating, datecreated, published) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
                [userid, title, isbn10, coverlink, genre, author, summary, content, rating, datecreated, false]);

            res.redirect("/myposts");

        } else if (req.body.action == 'publish') {

            const result = await pool.query("insert into userdrafts (userid, title, isbn10, coverlink, genre, author, summary, content, rating, datecreated, published, datepublished) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id",
                [userid, title, isbn10, coverlink, genre, author, summary, content, rating, datecreated, true, datecreated]);
            const userpostid = parseInt(result.rows[0].id);
            await pool.query("insert into published (userid, userpostid, title, isbn10, coverlink, genre, author, summary, content, rating, datepublished) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
                [userid, userpostid, title, isbn10, coverlink, genre, author, summary, content, rating, datecreated]);

            res.redirect("/myposts");
        }
    } else {
        res
            .status(404)
            .send("Unauthorised request");
    }
})

app.post("/save", async (req, res) => {
    if (req.isAuthenticated()) {
        const booktitle = req.body.title.trim() || "<Book Title>"
        const bookauthor = req.body.bookauthor.trim() || "<Book Author>"
        const title = (booktitle + " by " + bookauthor);
        const genre = req.body.genre.trim() || "<Book Genre>";
        const author = req.body.author.trim() || req.user.fname + " " + req.user.lname;
        const isbn10 = req.body.isbn.trim().replaceAll("-", "") || "0000000000";
        const summary = req.body.summary.trim() || "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.";
        const content = req.body.content.trim() || "";
        const rating = parseInt(req.body.rating) || 5;
        const coverlink = 'https://covers.openlibrary.org/b/isbn/' + isbn10 + '-M.jpg';
        const datecreated = new Date().getDate().toString() + "-" + ((new Date().getMonth()) + 1).toString() + "-" + new Date().getFullYear().toString();
        if (isbn10.length != 10 && isbn10.length != 13) {
            const post = {
                id: req.body.id,
                title: title,
                genre: genre,
                author: author,
                isbn10: "",
                summary: summary,
                content: content,
                rating: rating
            }
            res.render("edit.ejs", {
                user: req.user,
                errorisbn: 1,
                post: post
            });
        } else if (req.body.action == 'saveChanges') {
            if (req.body.published == false) {

                await pool.query('update userdrafts set title = $1, isbn10 = $2, coverlink = $3, genre = $4, author = $5, summary = $6, content = $7, rating = $8, datecreated = $9 where id = $10',
                    [title, isbn10, coverlink, genre, author, summary, content, rating, datecreated, req.body.id]);
                res.redirect("/myposts");

            } else {

                await pool.query('update userdrafts set title = $1, isbn10 = $2, coverlink = $3, genre = $4, author = $5, summary = $6, content = $7, rating = $8, datecreated = $9 where id = $10',
                    [title, isbn10, coverlink, genre, author, summary, content, rating, datecreated, req.body.id]);

                await pool.query('update published set title = $1, isbn10 = $2, coverlink = $3, genre = $4, author = $5, summary = $6, content = $7, rating = $8, datepublished = $9 where userpostid = $10',
                    [title, isbn10, coverlink, genre, author, summary, content, rating, datecreated, req.body.id]);
                res.redirect("/myposts");

            }
        }

    } else {
        res
            .status(404)
            .send("Unauthorised request");
    }
})

app.post("/delete", async (req, res) => {
    if (req.isAuthenticated()) {

        const post = JSON.parse(req.body.post);
        if (post.published == true) {

            await pool.query("delete from published where userpostid = $1", [post.id]);
            await pool.query("delete from userdrafts where id = $1", [post.id]);
            res.redirect("/myposts");

        } else {
            await pool.query("delete from userdrafts where id = $1", [post.id]);
            res.redirect("/myposts");
        }

    } else {
        res
            .status(404)
            .send("Unauthorised request");
    }
})

app.post("/publish", async (req, res) => {
    const post = JSON.parse(req.body.post);
    const userpostid = post.id;
    const userid = post.userid;
    const title = post.title;
    const genre = post.genre;
    const author = post.author;
    const isbn10 = post.isbn10;
    const summary = post.summary;
    const content = post.content;
    const rating = parseInt(post.rating);
    const coverlink = 'https://covers.openlibrary.org/b/isbn/' + isbn10 + '-M.jpg';
    const datepublished = new Date().getDate().toString() + "-" + ((new Date().getMonth()) + 1).toString() + "-" + new Date().getFullYear().toString();
    if (req.isAuthenticated()) {

        await pool.query("update userdrafts set published = true where id = $1", [post.id]);
        await pool.query("insert into published (userid, userpostid, isbn10, coverlink, genre, author, title, summary, content, rating, datepublished) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            [userid, userpostid, isbn10, coverlink, genre, author, title, summary, content, rating, datepublished]);
        res.redirect("/myposts");

    } else {
        res
            .status(404)
            .send("Unauthorised request");
    }

})

app.post("/edit", async (req, res) => {
    const post = JSON.parse(req.body.post);
    if (req.isAuthenticated()) {
        res.render("edit.ejs", {
            post: post,
            user: req.user
        })
    } else {
        res
            .status(404)
            .send('Unauthorised request');
    };
})


app.post("/view", async (req, res) => {
    const post = JSON.parse(req.body.post);
    if (req.isAuthenticated()) {
        res.render("view-auth.ejs", {
            post: post,
            user: req.user
        });
    } else {
        res.render("view.ejs", {
            post: post
        });
    }

})

app.post("/reviews", async (req, res) => {
    let data = await fetchData();
    let genre, ratingValue, genresort, ratingssort, datesort;
    let sortedData = [...data];
    genre = req.body.genre;
    ratingValue = req.body.ratingValue;
    genresort = req.body.genresort;
    ratingssort = req.body.ratingssort;
    datesort = req.body.datesort;
    if (req.isAuthenticated()) {
        const user = req.user;
        if (genre) res.render("reviews-auth.ejs", {
            data: data,
            filterData: data.filter((review) => review.genre == genre),
            user: user
        });
        else if (ratingValue) res.render("reviews-auth.ejs", {
            data: data,
            filterData: data.filter((review) => review.rating == ratingValue),
            user: user
        });
        else if (genresort == 'asc') res.render("reviews-auth.ejs", {
            data: sortedData.sort((a, b) => a.genre.localeCompare(b.genre)),
            user: user
        });
        else if (genresort == 'desc') res.render("reviews-auth.ejs", {
            data: sortedData.sort((a, b) => b.genre.localeCompare(a.genre)),
            user: user
        });
        else if (ratingssort == 'asc') res.render("reviews-auth.ejs", {
            data: sortedData.sort((a, b) => a.rating - b.rating),
            user: user
        });
        else if (ratingssort == 'desc') res.render("reviews-auth.ejs", {
            data: sortedData.sort((a, b) => b.rating - a.rating),
            user: user
        });
        else if (datesort == 'asc') res.render("reviews-auth.ejs", {
            data: sortedData.sort((a, b) => a.datepublished.localeCompare(b.datepublished)),
            user: user
        });
        else if (datesort == 'desc') res.render("reviews-auth.ejs", {
            data: sortedData.sort((a, b) => b.datepublished.localeCompare(a.datepublished)),
            user: user
        });
        else if (req.body.clear) res.redirect("/reviews");
    } else {
        if (genre) res.render("reviews.ejs", {
            data: data,
            filterData: data.filter((review) => review.genre == genre)
        });
        else if (ratingValue) res.render("reviews.ejs", {
            data: data,
            filterData: data.filter((review) => review.rating == ratingValue)
        });
        else if (genresort == 'asc') res.render("reviews.ejs", {
            data: sortedData.sort((a, b) => a.genre.localeCompare(b.genre))
        });
        else if (genresort == 'desc') res.render("reviews.ejs", {
            data: sortedData.sort((a, b) => b.genre.localeCompare(a.genre))
        });
        else if (ratingssort == 'asc') res.render("reviews.ejs", {
            data: sortedData.sort((a, b) => a.rating - b.rating)
        });
        else if (ratingssort == 'desc') res.render("reviews.ejs", {
            data: sortedData.sort((a, b) => b.rating - a.rating)
        });
        else if (datesort == 'asc') res.render("reviews.ejs", {
            data: sortedData.sort((a, b) => a.datepublished.localeCompare(b.datepublished))
        });
        else if (datesort == 'desc') res.render("reviews.ejs", {
            data: sortedData.sort((a, b) => b.datepublished.localeCompare(a.datepublished))
        });
        else if (req.body.clear) res.redirect("/reviews");
    }
})

app.get("/myposts", async (req, res) => {
    let data = await fetchDrafts();

    if (req.isAuthenticated()) {
        res.render("myposts.ejs", {
            user: req.user,
            data: data.filter((review) => review.userid == req.user.id),
            published: data.filter((review) => review.userid == req.user.id && review.published == true),
            drafts: data.filter((review) => review.userid == req.user.id && review.published == false)
        });
    } else {
        res
            .status(404)
            .send("Unauthorised request");
    }
})

app.get("/auth/google", passport.authenticate("google", {
    scope: ['profile']
}))

app.get("/auth/google/home", passport.authenticate("google", {
        failureRedirect: "/signin"
    }),
    function (req, res) {
        res.redirect("/");
    }
)

app.get("/signin", async (req, res) => {
    const errorMessage = req.flash("error");
    res.render("signin.ejs", {
        error: errorMessage
    });
})

app.get("/signout", (req, res, next) => {
    req.logOut((err) => {
        if (err) return next(err);
    });
    res.redirect("/");
})

app.post("/signin", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/signin",
    failureFlash: true
}))

app.get("/register", async (req, res) => {
    res.render("register.ejs");
})

app.post("/register", async (req, res) => {
    const fName = req.body.fName.trim();
    const lName = req.body.lName.trim();
    const username = req.body.username.trim();
    const password_hash = await bcrypt.hash(req.body.password, 10);
    if (req.body.password === req.body.repassword) {
        try {
            const result = await pool.query("insert into users (fName, lName, username, password) values ($1, $2, $3, $4) returning *", [fName, lName, username, password_hash]);
            console.log("Account created");
            const newUser = result.rows[0];
            console.log(newUser);
            req.login(newUser, (err) => {
                if (err) {
                    return next(err);
                }

                // Redirect or respond as needed after successful registration and login
                res.redirect("/");
            });

        } catch (error) {
            console.log(error);
            res.render("register.ejs", {
                error: "Username already taken"
            })
        }
    } else {
        res.render("register.ejs", {
            error: "Passwords did not match"
        });
    }
})


app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});