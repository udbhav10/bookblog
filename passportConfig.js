import {
    Strategy as LocalStrategy
} from "passport-local";
import {
    pool
} from "./dbConfig.js";
import bcrypt from "bcrypt";


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

function initialize(passport) {
    passport.use(
        new LocalStrategy({
                usernameField: "username",
                passwordField: "password"
            },
            authenticateUser
        ));


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
}

export { initialize };