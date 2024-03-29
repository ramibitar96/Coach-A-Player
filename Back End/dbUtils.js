// Imports
const sqlite = require('sqlite');
const fs = require('fs');
const strip = require('sql-strip-comments');
const ErrorCodeEnum = require('./errorCodes.js');
const riotUtils = require('./riotUtils.JS');

var db;     // The connection to the SQLite database.

// Initializes the database, creating all the tables.
// If the database has already been initialized, does nothing.
async function initializeDatabase()
{
	// Connect to the database
	db = await sqlite.open('./database_contents/database.sqlite', {Promise});
    module.exports.db = db;     // Ensures other files will be able to reference db

	// Create the tables
	await executeSQLScript("./sql_scripts/initialize_database.sql", db);
}

// Returns the given user's uid.
// If there is no such user, returns undefined.
async function getUID(username)
{
	let query = "SELECT rowid FROM user WHERE user_name = ?;"
	let queryResult = await db.get(query, username);

	if (queryResult === undefined)
		return undefined;

	return queryResult.rowid;
}

// Queries the database for the given user's preferences.
// See PREFERENCES_API for the structure of the object it returns.
async function getUserPrefs(username)
{
	// Get the user id
	// TODO: Refactor this so user id is passed as a parameter isntead.
	let uid = await getUID(username);

	// Query for current rank and misc stuff
	let miscPrefsQuery = 
	`
		SELECT
			user_id,
			view_replay,
			twitch_name,
			min_coach_rank,
			max_coachee_rank
		FROM 
			user_misc_preferences
		WHERE
			user_id = ?;
	`;

	let miscPrefsPromise = db.get(miscPrefsQuery, uid);
	let current_rank_promise = riotUtils.get_rank(username);

	let miscPrefs = await miscPrefsPromise
	let current_rank = await current_rank_promise;

	// If misc prefs weren't found, they'll have these default values
	let view_replay = null;
	let twitch_name = null;
	
	let min_coach_rank = -1;
	let max_coachee_rank = -1;

	// If the misc prefs were found, get them
	if (miscPrefs != undefined)
	{
		view_replay = Boolean(miscPrefs.view_replay);	// SQLite returns integers 0 and 1, so we need to cast to a bool
		twitch_name = miscPrefs.twitch_name;
		min_coach_rank = miscPrefs.min_coach_rank;
		max_coachee_rank = miscPrefs.max_coachee_rank;
	}

	// Query for the skills
	let coachSkills = await getSkillPrefs(uid, false);
	let coacheeSkills = await getSkillPrefs(uid, true);

	// Construct the object
	let output =
	{
		error_code: ErrorCodeEnum.SUCCESS,

		user:
		{
			twitch_name: twitch_name,
			current_rank: current_rank
		},

		student:
		{
			skills: coacheeSkills,
			min_coach_rank: min_coach_rank
		},

		coach:
		{
			view_replay: view_replay,
			skills: coachSkills,
			max_coachee_rank: max_coachee_rank
		},
	};

	return output;
}
//retrieve pfp
async function getProfileImg(username)
{
  let getQuery = "select profile_img from user where user_name = ?";
	let getPromise = db.get
	  (
			getQuery,
			username
		);
	getImg = await getPromise;
	img = "./imgs/default.png";
  if(getImg != undefined) {
		if(getImg.profile_img != null) {
			img = getImg.profile_img.split("../frontend/")[1];
		}
	}
	let output = 
		{
			error_code: ErrorCodeEnum.SUCCESS,
			img: img
		};
	console.log(JSON.stringify(output));
	return output;
}
//allows user to set profile image
async function setProfileImg(username,url)
{
	//get user id
	let uidQuery = `Select rowid FROM user WHERE user_name=?;`;
	let uidResults = await db.run(uidQuery,username);
	let uid = uidResults.rowid;
	console.log(username);
	//update the user's profile picture
	let imgLocalUrl = url; 
	let updateQuery = "UPDATE user SET profile_img = ? WHERE user_name = ?";
	let updatePromise = db.run
		(
		 updateQuery,
		 imgLocalUrl,
		 username,
		);
  await updatePromise;
	return {error_code: ErrorCodeEnum.SUCCESS};
}

async function uploadReplayFile(username, url)
{
	//get id
	let uidQuery = "SELECT rowid FROM user WHERE user_name = ?;";
	let uidResults = await db.get(uidQuery, username);
	let uid = uidResults.rowid;
	console.log(uid);
	//add replay file
	let replayLink = url;
	let addQuery = "INSERT INTO replays (" +
		"replay_owner_id, replay_url)" +
		"VALUES (?,?);";
	console.log(uid);
	let addQueryPromise = await db.run(addQuery, uid, replayLink);
	await addQueryPromise;
	console.log(addQueryPromise);

	return {error_code: ErrorCodeEnum.SUCCESS};
}
	
// Updates the database with the new preferences
async function setUserPrefs(username, prefsData)
{
	// Get the user id
	let uidQuery = "SELECT rowid FROM user WHERE user_name = ?;";
	let uidResults = await db.get(uidQuery, username);
	let uid = uidResults.rowid;

	// Delete the preferences row if it already exists
	let deleteQuery = `DELETE FROM user_misc_preferences WHERE user_id = ?;`;
	await db.run(deleteQuery, uid);

	// Set misc user preferences
	let miscPrefsQuery = 
	`
		INSERT INTO user_misc_preferences
		(
			user_id,
			view_replay,
			twitch_name,
			min_coach_rank,
			max_coachee_rank
		)
		VALUES (?, ?, ?, ?, ?);
	`;

	let miscPrefsPromise = db.run
	(
		miscPrefsQuery,
		uid,
		prefsData.coach.view_replay,
		prefsData.user.twitch_name,
		prefsData.student.min_coach_rank,
		prefsData.coach.max_coachee_rank
	);

	// Set the skill settings
	let coachSkillsPromise = setSkillPrefs(uid, prefsData.coach.skills, false);
	let coacheeSkillsPromise = setSkillPrefs(uid, prefsData.student.skills, true);

	// Wait for all the promises to finish.
	await miscPrefsPromise;
	await coachSkillsPromise;
	await coacheeSkillsPromise;

	return {error_code: ErrorCodeEnum.SUCCESS};
}

// Queries the database for a given user's coach skill preferences.
// Returns a boolean array specifying if each skill present.
// If coachee is true, it will search for coachee skills instead of coach skills.
async function getSkillPrefs(userid, coachee)
{
	// Decide which table to query
	let tableName = "coach_skills";
	if (coachee)
		tableName = "coachee_skills";

	// Query for the skills
	let skillRows = await db.all
	(
		"SELECT skill_id FROM " + tableName + " WHERE user_id = ?;",
		userid
	);

	// Start each skill as false
	let output = [];
	for (let i = 0; i < 8; i++)
		output.push(false);

	// Mark each skill true if it was returned in the query
	for (let i = 0; i < skillRows.length; i++)
	{
		let skill_id = skillRows[i].skill_id;
		output[skill_id] = true;
	}

	return output;
}

// Sets a given user's coach skill preferences.
// skills is a boolean array specifying if each skill present.
// If coachee is true, it will search for coachee skills instead of coach skills.
async function setSkillPrefs(userid, skills, coachee)
{
	// Decide which table to query
	let tableName = "coach_skills";
	if (coachee)
		tableName = "coachee_skills";

	// We're going to be building a big query, so buckle up!
	let query = ""

	query += "BEGIN TRANSACTION;\n"	// We want our entire query to be atomic; if one
									// statement fails, then all the previous statements
									// will be cancelled.  That way the database doesn't
									// get corrupted.

	// Clear any existing skills in the database
	query += "DELETE FROM " + tableName + " WHERE user_id = " + userid + ";\n";

	// Add back the skills that were set to true
	for (let i = 0; i < skills.length; i++)
	{
		if (!skills[i])
			continue;

		query += "INSERT INTO " + tableName + "(user_id, skill_id) VALUES(" + userid + ", " + i + ");\n";
	}

	query += "END TRANSACTION;";

	// Execute the query and return success
	await db.exec(query);
}

// Adds a review from the given student for the given coach
// upvoteOrDownvote is a bool.  If true, it's an upvote, else downvote
// text is the text of the review
async function add_review(student_uid, coach_uid, rating, text)
{
	// TODO: Error checking

	let query = 
	`
		INSERT INTO coach_reviews
		(
			student_user_id,
			coach_user_id,
			review_date,
			rating,
			review_text
		)
		VALUES
		(?, ?, ?, ?, ?);
	`;

	let date = new Date();
	db.run
	(
		query,
		student_uid,
		coach_uid,
		date,
		rating,
		text
	);
}

// Returns all reviews for the given user
// If there is no such users, returns undefined
async function get_reviews(coach_username)
{
	// Get the userid
	// TODO: Error checking
	let coach_uid = await getUID(coach_username);

	// Error if the username doesn't exist
	if (coach_uid === undefined)
		return undefined;

	// Grab the reviews from the database
	let query = 
	`
		SELECT 
			user.user_name,
			user.rowid,
			coach_reviews.coach_user_id,
			coach_reviews.student_user_id,
			coach_reviews.review_date,
			coach_reviews.rating,
			coach_reviews.review_text
		FROM 
			coach_reviews,
			user
		WHERE
			coach_reviews.coach_user_id = ? AND
			user.rowid = coach_reviews.student_user_id;
	`;
	let rows = await db.all(query, coach_uid);

	console.log("retrieved review rows: " + JSON.stringify(rows));

	// Put them in a form that matches the documentation
	let results = [];
	for (let row of rows)
	{
		let reviewObj =
		{
			author: row.user_name,
			date: row.review_date,
			rating: row.rating,
			text: row.review_text
		};

		results.push(reviewObj);
	}

	return results;
}

// get replays for the specified username
// If there are none, returns null.
async function getReplays(username) 
{
  	let uid = await getUID(username);
	console.log(uid);
	getReplaysQuery = "select replay_url from replays where replay_owner_id=?";
	getResults = await db.all(getReplaysQuery, uid);

	// If there are no replays for this user, return null
	if (getResults === undefined)
		return null;

	// Put the results in a different form.
	results = [];
	for(let row of getResults)
	{
		let resObj = {url:row.replay_url};
		results.push(resObj);
	}
	console.log(results);
	return results;
};

// Deletes all replays by the given user
async function deleteReplays(username)
{
	let uid = await getUID(username);
	let query = "DELETE FROM replays WHERE replay_owner_id = ?;"
	await db.run(query, uid);
}

// Records the pervious partners of a newly matched pair
// TODO: Save this in the database instead of in memory
let previousPartners = {};
async function set_previous_partners(coach_username, student_username)
{
	console.log("updating last partners of " + coach_username + " and " + student_username);
	previousPartners[coach_username] = student_username;
	previousPartners[student_username] = coach_username;
}

// Retrieves the previous partner of the given user
// TODO: retrieve this from database instead of memory
async function get_previous_partner(username)
{
	return previousPartners[username];
}

/**
 * Creates an entry in the database for a chat session
 * chatroom is of type "Chatroom" from socketIOEvents.js
 */
async function save_chat_session(chatroom)
{
	// Stringify the json data that we can't natively store in the DB
	let drawLog_str = JSON.stringify(chatroom.drawLog);
	let gameData_str = JSON.stringify(chatroom.gameData);

	// Put it in the database
	let query =
	`
		INSERT INTO chat_session
		(
			user1,
			user2,
			creation_time,
			log,
			draw_log,
			game_data
		)
		VALUES (?, ?, ?, ?, ?, ?);
	`;

	await db.run
	(
		query,
		chatroom.user1,
		chatroom.user2,
		new Date(),
		chatroom.log,
		drawLog_str,
		gameData_str
	);
}

/**
 * Gets all recent chat sessions, sorted by their date/time.
 * Returns them as an array of json objects in the following form:
 * {
 * 		user1:    <string>
 * 		user2: 	  <string>
 * 		log:	  <string>	// The whole chat log all in one giant string LMAO
 * 		draw_log:  <array of something, idk what>
 * 		game_data: <probably a JSON object from RIOT's API.>
 * }
 */
async function get_chat_sessions()
{
	// Get them from the database
	/*let query =
	`
		SELECT user1, user2, log, draw_log, game_data
		FROM chat_session
		ORDER BY datetime(creation_time) DESC;
	`;*/
	let query = "SELECT * FROM chat_session";
	let rows = await db.all(query);

	// Go through them and parse those two JSON objects
	for (let i = 0; i < rows.length; i++)
	{
		rows[i].draw_log = JSON.parse(rows[i].draw_log);
		rows[i].game_data = JSON.parse(rows[i].game_data);
	}

	// Return that shit
	return rows;
}

// Executes the SQL script specified by filePath.
// Returns a Promise<sqlite.Statement> when it's done.
// filePath's type is string.  db's type is sqlite.Database
function executeSQLScript(filePath, db)
{
	let sqlText = fs.readFileSync(filePath, 'utf8');	// Read the SQL file into a string
	let noComments = strip(sqlText);					// Remove all comments so sqlite can execute it.

	// Execute it.
	return db.exec(noComments);
}

// Exports
module.exports =
{
	initializeDatabase,
	getUserPrefs,
	setUserPrefs,
	setProfileImg,
	getProfileImg,
	uploadReplayFile,
	deleteReplays,
	add_review,
	get_reviews,
	getReplays,
	getUID,
	set_previous_partners,
	get_previous_partner,
	save_chat_session,
	get_chat_sessions,
    db
}
