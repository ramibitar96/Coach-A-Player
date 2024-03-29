//user type

//0 student
//1 coach
//2 guest
//3 ama
var type = localStorage.getItem("queueType");
var chatroomNumber = parseInt(localStorage.getItem("chatroomNumber"), 10);
var me = getCookie("session_token").toUpperCase();

var debug = false;
if (me === "TEST" || me === "TEST2") {
	var debug = true;
}

var socket = io.connect('http://localhost:3000');

var writeReview = false;
var log = "";

var partner = "";
var public_room = false;
var roomid = "";
var isAMARoom = false;
var gameId;

//send queue type
if (type == 2) {
	let msgObj =
    {
        type: type,
        chatroomNumber: chatroomNumber
    };

    socket.emit("queueType", msgObj);
} else {
	socket.emit("queueType", type);
}

socket.on('message_received', function(msg)
{
	//TODO
	document.getElementById('alert').play();

	var line = msg.contents;
	var parse = parseEmotes(line, true);
	var response = msg.sender + ": " + parse + "\n";

	let chatArea = document.getElementById("chatArea");
	if (response != "") {
		chatArea.textContent += response;
	}
	log += msg.sender + ": " + msg.contents + "\n";
});

socket.on('match_found', function(msg)
{
	//get roomid and partnerid
	roomid = msg.roomid;
	partner = msg.partner;

	// Put it in the chatbox
	let chatArea = document.getElementById("chatArea");
	chatArea.textContent = "MATCH FOUND\n";
	writeReview = true;

	if (type == 1 && !debug) { //if coach, get the student spectate link
		$.ajax({
			type: "GET",
			url: "http://localhost:3000/get_student_match",
			success: function(data) {
				//if error code
				if (data["error_code"] == 9 || data["error_code"] == 10 || data["error_code"] == 11) {
					socket.emit("end_chat", "end_chat");
					$('#endChat').foundation('reveal', 'open');
				}
				else {
					var json = JSON.parse(data);

					//neccessary vars
					var key = json["observers"]["encryptionKey"];
					var platformId = json["platformId"];	
					var summonerId = "";		

					gameId = json["gameId"];

					var p = json["participants"];
					jQuery.each(p, function() {
						if (this["summonerName"].toUpperCase() === me) {
							summonerId = this["summonerId"];
						}
					});					
					serveFile(key, platformId, summonerId);
					$('#spectateStudent').foundation('reveal', 'open');
				}
			}
		});	
	}
	else if (type == 0 && !debug) { //if student, open up modal
		$('#inGameCheck').foundation('reveal', 'open');
	}
	else {
		if (type == 0) {
			$('#inGameCheck').foundation('reveal', 'open');
		}
		else {
			//sample
			gameId = "2770683953";
			serveFile("z82Ui/V0YGXOlT+RA7VbZtO3YNpUn91P", "NA1", "19134540");
			$('#spectateStudent').foundation('reveal', 'open');
		}
	}
});

socket.on('ama_created', function(msg)
{
	//get roomid and partnerid, set variables
	roomid = msg.chatroomNumber;
	public_room = true;
	writeReview = true;
	isAMARoom = true;
	toColor("green", "Public: " + roomid);
});

socket.on('rejoin_chat', function(msg)
{
	// Fill chat box with previously sent messages
	let chatArea = document.getElementById("chatArea");
	var parse = msg.log;
	parse = parse.split("\n");
	for (var i = 0; i < parse.length; i++) {
		var contents = parse[i].substring(parse[i].indexOf(":")+1);
		var line = parseEmotes(contents, false);	
		if (line == "") {
			continue;
		}
		var message = parse[i].substring(0, parse[i].indexOf(":")) + ":" + line + "\n";
		chatArea.textContent += message;
	}
	for (var i = 0; i < msg.drawLog.length; i++) {
		onDrawingEvent(msg.drawLog[i]);
	}

	public_room = msg.publicRoom;
	roomid = msg.chatroomNumber;
	if (debug) {
		testParse();
	} else {
		parseGame(msg.gameData);
	}
	if (msg.user2 == null) {
		isAMARoom = true;
	}

if (public_room) { //if public
	toColor("green", "Public: " + roomid);
}
else {
	toColor("red", "Private");
}
writeReview = true;
});

socket.on('end_chat', function(msg)
{
	let chatArea = document.getElementById("chatArea");
	chatArea.textContent += "CHAT ENDED\n";
	//simulate end chat click
	$('#endChat').foundation('reveal', 'open');
});

socket.on('end_chat_guest', function(msg)
{
	alert("This chatroom has been made private. Returning you to the main page");
	window.location.assign("queue.html");
});

socket.on('invalid_chatroom', function(msg)
{
	// Alert user, then return them to the queue page
	alert("Error: invalid chatroom specified");
	window.location.assign("queue.html");
});

//whiteboard stuff
var canvas = document.getElementsByClassName('whiteboard')[0];
var colors = document.getElementsByClassName('color');
var context = canvas.getContext('2d');

var current = {
	color: 'black'
};
var drawing = false;

canvas.addEventListener('mousedown', onMouseDown, false);
canvas.addEventListener('mouseup', onMouseUp, false);
canvas.addEventListener('mouseout', onMouseUp, false);
canvas.addEventListener('mousemove', throttle(onMouseMove, 10), false);

for (var i = 0; i < colors.length; i++){
	colors[i].addEventListener('click', onColorUpdate, false);
}

socket.on('drawing', onDrawingEvent);

window.addEventListener('resize', onResize, false);
onResize();

function keypressHandle(e)
{
	// keycode 13 is 'enter'
	if (e.keyCode == 13)
		sendMessage();
}

function sendMessage()
{
	let inputText = document.getElementById("inputText");
	let chatArea = document.getElementById("chatArea");

	// Send the message
	let msg = inputText.value;

	//guests cannot send messages
	if (type == 2 && !isAMARoom) {
		return;
	}

	if (writeReview) {
		socket.send(msg);
	}
	inputText.value = "";

	//TODO
	var original = "Me: " + msg + "\n";
	var parse = parseEmotes(msg, true);
	
	if (parse != "") {
		chatArea.textContent += "Me: " + parse + "\n";
	}
	log += original;
}

function parseEmotes(line, show) {
	var response = line;
	var myRegexp = /:([^ ]+):/g;
	match = myRegexp.exec(line);
	while (match != null) {
		//display emote
		if (show) {
			displayEmote(match[0].substring(1, match[0].length-1));
		}
		response = response.replace(match[0], "");
		match = myRegexp.exec(line);
	}
	response = response.replace(/  +/g, ' ');
	if (response == " ") {
		response = "";
	}
	return response;
}

function displayEmote(champion) {
	var emote = document.getElementById("emote");
	emote.style.backgroundImage = "url('../img/championName/" + champion.toLowerCase() + ".png')";
	
	emote.className = "fadeIn";
	setTimeout(
		function() {
			emote.className = "fadeOut";
	}, 5000);
}

function openModal() {
	if (writeReview && type != 2 && !isAMARoom) {
		socket.emit("end_chat", "end_chat");
		$('#endChat').foundation('reveal', 'open');
	} 
	else if (isAMARoom) {
		socket.emit("end_ama");
		window.location.assign("queue.html");
	}
	else { window.location.assign("queue.html"); }
}

function submitReview() {
	//clear localstorage
	localStorage.removeItem("queueType");

	//submit review
	var rating = $('input[name="rating"]:checked').val();	
	if (rating == null) {
		rating = 3;
	}

	var review = $("#review_txt").val();

	//clean input if all spaces
	if (review.trim() == '') {
		review = "";
	}
	review = review.replace(/"/g, "'");

	let body = {
		rating: rating,
		text: review
	};

	//alert(JSON.stringify(body));
	$.ajax({
			type: "POST",
			url: "http://localhost:3000/add_review",
			contentType: 'application/json',
			processData: false,
			async: false,
			data: JSON.stringify(body),
			success: function (data)
			{
				var response = data;
				if (response["error_code"] == 0)
				{
					window.location.assign("queue.html");
				}
			}
	});
	}

	/* https://socket.io/demos/whiteboard/ */

function drawLine(x0, y0, x1, y1, color, emit){
	/*if (type == 2 && !isAMARoom) { //cannot draw as guest
		return;
	}*/

	context.beginPath();
	context.moveTo(x0, y0);
	context.lineTo(x1, y1);
	context.strokeStyle = color;
	context.lineWidth = 2;
	context.stroke();
	context.closePath();

	if(!emit) { return; }

	//whiteboard is a square, ignore topbar
	var h = canvas.height - 75;
	var w = h;

	//adjust for topbar positioning
	y0 = y0 - 75;
	y1 = y1 - 75;

	//if map is not on edge of screen
	var filler = $(".cr-filler").width();
	if (filler != 0) {
		x0 = x0 - filler;
		x1 = x1 - filler;
	}

	socket.emit('drawing', {
			x0: x0 / w,
			y0: y0 / h,
			x1: x1 / w,
			y1: y1 / h,
			color: color });
}

function onMouseDown(e){
	drawing = true;
	current.x = e.clientX;
	current.y = e.clientY;
}

function onMouseUp(e){
	if (!drawing) { return; }
	drawing = false;
	drawLine(current.x, current.y, e.clientX, e.clientY, current.color, true);
}

function onMouseMove(e){
	if (!drawing) { return; }
	drawLine(current.x, current.y, e.clientX, e.clientY, current.color, true);
	current.x = e.clientX;
	current.y = e.clientY;
}

function onColorUpdate(e){
	current.color = e.target.className.split(' ')[1];
}

// limit the number of events per second
function throttle(callback, delay) {
	var previousCall = new Date().getTime();
	return function() {
		var time = new Date().getTime();

		if ((time - previousCall) >= delay) {
			previousCall = time;
			callback.apply(null, arguments);
		}
	};
	}

	function onDrawingEvent(data){
		//whiteboard is a square, ignore topbar
		var h = canvas.height - 75;
		var w = h;

		//multiply by canvas height and then adjust for the topbar
		var y0 = (data.y0 * h) + 75;
		var y1 = (data.y1 * h) + 75;

		//multiply by canvas width
		var x0 = (data.x0 * w);
		var x1 = (data.x1 * w);

		//if map is not on edge of screen
		var filler = $(".cr-filler").width();
		if (filler != 0) {
			x0 = x0 + filler;
			x1 = x1 + filler;
		}

		drawLine(x0, y0, x1, y1, data.color, false);
	}

	// make the canvas fill its parent
	function onResize() {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
	}

	function toColor(color, text) {
		//switch color to red
		$(".privacy").removeClass("green");
		$(".privacy").removeClass("yellow");
		$(".privacy").removeClass("red");
		$(".privacy").addClass(color);

		//change text
		$(".privacy").children().text(text)
	}

	function askToggle() {
		if (public_room) {
			socket.emit("toggle_privacy", true);
			toColor("red", "Private");

			public_room = false;
		}
		else {
			toColor("yellow", "Waiting...");
			socket.emit("ask_to_toggle", "");
		}
		}

		//respond to privacy question
		socket.on('ask_to_toggle', function(msg)
		{
			$('#askToToggle').foundation('reveal', 'open');
		});

		function respondToggle(bool) {
			$('#askToToggle').foundation('reveal', 'close');

			if (bool) { //if true, turn room to public
				toColor("green", "Public: " + roomid);
				public_room = true;

				socket.emit("toggle_privacy", true);
			} 
			else { //emit false
				socket.emit("toggle_privacy", false);
				public_room = false;
			}
			}

			socket.on('toggle_privacy', function(msg) {
				if (msg) { //swap
					public_room = !public_room
				}

				if (public_room) { //if public
					toColor("green", "Public: " + roomid);
				}
				else {
					toColor("red", "Private");
				}
			});

			function getMatchId(filename) {
				filename = filename.split("-")[1];
				filename = filename.split(".")[0];
				return filename;
			}

			function checkReplay() {
				$.ajax({
						type: "GET",
						url: "http://localhost:3000/get_replays",
						success: function(data) {
							if (data.length == 0) { //no replay
								socket.emit("end_chat", "end_chat");
							}
							else { //has replay
								//emit match id
								socket.emit("replay_file", getMatchId(data[0]));
								
								//display
								displayReplay(getMatchId(data[0]));
							}
						}
				});
			}
			
			socket.on('replay_file', function(msg) { 
				displayReplay(msg);
			}

			function displayReplay(match) {
				$.ajax({
						type: "GET",
						url: "http://localhost:3000/get_match?gameid=" + match,
						success: function(data) {
							var json = JSON.stringify(data);
							socket.emit("game_data", json);
							parseGame(json);
							$('#inGameCheck').foundation('reveal', 'close');
							$('#spectateStudent').foundation('reveal', 'close');
						}
				});

			}


			function gameOver() {
				if (debug) {
					socket.emit("match_over","");	
					$('#inGameCheck').foundation('reveal', 'close');	
					return;
				}

				$.ajax({
						type: "GET",
						url: "http://localhost:3000/isInGame",
						success: function(data) {
							//if false, close modal and emit match_over
							if (!data["inGame"]) {
								socket.emit("match_over","");	
								$('#inGameCheck').foundation('reveal', 'close');
							}
							else { //check if has replay
								checkReplay();
							}
						}
				});
			}

			socket.on('match_over', function(msg) {
				$.ajax({
						type: "GET",
						url: "http://localhost:3000/get_match?gameid=" + gameId,
						success: function(data) {
							var json = JSON.stringify(data);
							socket.emit("game_data", json);
							parseGame(json);
							$('#spectateStudent').foundation('reveal', 'close');
						}
				});
			});

			socket.on("game_data", function(msg) {
				parseGame(msg);
			});

			function getCookie(cname) {
				var name = cname + "=";
				var ca = document.cookie.split(';');
				for(var i = 0; i < ca.length; i++) {
					var c = ca[i];
					while (c.charAt(0) == ' ') {
						c = c.substring(1);
					}
					if (c.indexOf(name) == 0) {
						return c.substring(name.length, c.length);
					}
				}
				return "";
			}
