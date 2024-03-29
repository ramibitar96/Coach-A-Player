// Testing
var socket = io.connect('http://localhost:3000');
var user = getCookie("session_token");

//load initial ama list
refreshList();

function refreshList() {
	socket.emit('request_amas');
}

socket.on('ama_list', function(msg)
{
	//clear and load new results
	$("#tbody").empty();

	var list = msg.split("\n");

	for (var i = 0; i < list.length; i++) {
		if (list == "" || list == null) {
			var text = "<tr>" +
				"<td>No AMAs</td>" +
				"<td></td>" +
				"<td></td></tr>";

			$("#tbody").append(text);
			break;
		}
		var list_data = list[i].split(": ");

		var text = "<tr>" +
			"<td>" + list_data[1] + "</td>" +
			"<td></td>" +
			"<td><a class='button' onclick='enterChatroom(" + list_data[0] + ")'>Join</td></tr>";

		$("#tbody").append(text);
	}
});

function checkReplay() {
	$.ajax({
		type: "GET",
		url: "http://localhost:3000/get_replays",
		success: function(data) {
			if (data.length == 0) { //no replay
				alert("Please upload a replay file or get in game");			
			}
			else { //has replay
				alert("has replay");
				localStorage.setItem("queueType","0");
				window.location.assign("chatroom.html");	
			}
		}
	});
}

function queueStudent() {
	//debug users are test and test2
	if (user != "test" && user != "test2") {
		//check if in game
		$.ajax({
			type: "GET",
			url: "http://localhost:3000/isInGame",
			success: function(data) {
				//if true redirect
				if (data["inGame"]) {
					alert("in game");
					localStorage.setItem("queueType","0");
					window.location.assign("chatroom.html");	
				}
				else { //if false
					//check if replay exists
					checkReplay();
				}
			}
		});
	}
	else {
		localStorage.setItem("queueType","0");
		window.location.assign("chatroom.html");
	}
}

function queueCoach() {
	localStorage.setItem("queueType","1");
	window.location.assign("chatroom.html");
}

function enterChatroom() {
	var id = $("#joinRoom").val();

	if (id == "" || id == null) {
		return;
	}

	// Join chatroom
	localStorage.setItem("queueType","2");
	localStorage.setItem("chatroomNumber", id);
	window.location.assign("chatroom.html");
}

function enterChatroom(id) {
	// Join chatroom
	if (id == undefined) {
		id = document.getElementById("joinRoom").value
	}

	localStorage.setItem("queueType","2");
	localStorage.setItem("chatroomNumber", id);
	window.location.assign("chatroom.html");
}

function createAMA() {
	localStorage.setItem("queueType","3");
	window.location.assign("chatroom.html");
}

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
$(".user").text(user);
