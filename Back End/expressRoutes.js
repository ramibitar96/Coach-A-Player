// Imports
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const dbUtils = require('./dbUtils.js');
const auth = require('./authenticationUtils.js');
const matchmaking = require('./matchmaking.js');
const ErrorCodeEnum = require('./errorCodes.js');

module.exports = function(app)
{
    // Tell expressjs that we want to allow cookies from mutliple origins
    app.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });

    app.use(bodyParser.json());					// Tell expressjs that we want it to parse the request bodies as json.
    app.use(cookieParser());                    // Tell expressjs that we want it to parse cookies it receives.

    // Handles registration requests
    // TODO: Have the user give their summoner name and then look up the summoner id over Riot's api
    app.post('/register', async function(req, res)
    {
        console.log(req.body);

        // Error if the body's json object is missing a property.
        let requiredProperties =
        [
            "username",
            "password",
            "email",
            "summoner_id"
        ];
        for (let i = 0; i < requiredProperties.length; i++)
        {
            if (!req.body.hasOwnProperty(requiredProperties[i]))
            {
                res.send({error_code: ErrorCodeEnum.BAD_JSON_OBJECT});
                return;
            }
        }

        // Try to register the user
        let errorCode = await auth.registerUser(req.body.username, req.body.password, req.body.email, req.body.summoner_id);
        res.send({error_code: errorCode});
    });


    // Handles log in requests
    app.post('/login', async function(req, res)
    {
        // Error if bad JSON.
        if (!req.body.hasOwnProperty("username") || !req.body.hasOwnProperty("password"))
        {
            res.send({error_code: ErrorCodeEnum.BAD_JSON_OBJECT});
            return;
        }

        // Generate a session token
        let token = await auth.login(req.body.username, req.body.password);

        // Error if the username and password were invalid
        if (token === null)
        {
            res.send({error_code: ErrorCodeEnum.WRONG_PASSWORD});
            return;
        }

        // Set the cookie to the token and send success.
        let cookieOptions =
        {
            secure: false,      // TODO: Set this to true once we get HTTPS working
            maxAge: auth.TOKEN_EXPIRATION_MS
        };

        res.cookie("session_token", token, cookieOptions);
        res.send({error_code: ErrorCodeEnum.SUCCESS});
    });

    // Retrieves the user preferences of the currently logged-in user.
    app.get('/get_prefs', async function(req, res)
    {
        // TODO: Error if bad json object for cookie
        let token = req.cookies.session_token;
        let authResults = await auth.checkToken(token);

        // Send the error code if the token is bad
        if (authResults.error_code != 0)
        {
            res.send({error_code: authResults.error_code});
            return;
        }

        // Retrieve the user prefs and send them.
        let results = await dbUtils.getUserPrefs(authResults.username);
        res.send(results);
    });

    // Sets the user preferences of the currently logged-in user.
    app.post('/set_prefs', async function(req, res)
    {
        // TODO: Error if bad json object for cookie
        let token = req.cookies.session_token;
        let authResults = await auth.checkToken(token);

        // Send the error code if the token is bad
        // TODO: Refactor this copypasta code
        if (authResults.error_code != 0)
        {
            res.send({error_code: authResults.error_code});
            return;
        }

        // TODO: Error if the body does not have the required data

        // Set the preferences
        let results = await dbUtils.setUserPrefs(authResults.username, req.body);
        res.send(results);
    });

    app.post('/add_review', await function(req, res)
    {
        // TODO: Error if bad json object for cookie
        let token = req.cookies.session_token;
        let authResults = await auth.checkToken(token);

        // Send the error code if the token is bad
        // TODO: Refactor this copypasta code
        if (authResults.error_code != 0)
        {
            res.send({error_code: authResults.error_code});
            return;
        }

        // TODO: Error if bad json object for body

        // Get the user ids
        let coach_username = matchmaking.findPartner(authResults.username);
        let coach_uid = await dbUtils.getUID(coach_username);
        let student_uid = await dbUtils.getUID(authResults.username);

        // Get the stuff from the body
        let upvoteDownvote = req.body.upvoteOrDownvote;
        let text = req.body.text;

        dbUtils.add_review(student_uid, coach_uid, upvoteDownvote, text);
    });

    // Returns a webpage displaying the username of the currently-logged-in user.
    app.get('/whats_my_username', async function(req, res)
    {
        // TODO: Error if bad json object for cookie.

        console.log("received cookies: " + JSON.stringify(req.cookies));

        // Decode the username
        let token = req.cookies.session_token;
        let authResults = await auth.checkToken(token);

        // Display error messages
        let error_code = authResults.error_code;
        if (error_code == ErrorCodeEnum.TOKEN_EXPIRED)
        {
            res.send("ERROR: Token Expired.  Please log in again.");
            return;
        }

        if (error_code == ErrorCodeEnum.TOKEN_INVALID)
        {
            res.send("ERROR: Invalid token.  Are you a hacker?");
            return;
        }

        // Send the username
        res.send("Hello, " + authResults.username);
    });
}