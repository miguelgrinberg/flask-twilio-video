const usernameInput = document.getElementById('username');
const button = document.getElementById('join_leave');
const container = document.getElementById('container');
const count = document.getElementById('count');
var connected = false;
var room;

var connect = () => {
    // get a token from the back end
    var username = usernameInput.value;
    if (!username) {
        alert('Enter your name before connecting');
        return;
    }
    button.disabled = true;
    button.innerHTML = 'Connecting...';

    fetch('/login', {
        method: 'POST',
        body: JSON.stringify({'username': username})
    }).then(res => res.json()).then(data => {
        // join video call
        Twilio.Video.connect(data.token).then(_room => {
            room = _room;
            room.participants.forEach(participantConnected);
            room.on('participantConnected', participantConnected);
            room.on('participantDisconnected', participantDisconnected);
            connected = true;
            button.innerHTML = 'Leave call';
            button.disabled = false;
            updateParticipantCount();
        });
    }).catch(() => {
        alert('Could not obtain token. Is the backend running?');
        button.innerHTML = 'Join call';
        button.disabled = false;
    });
};

const disconnect = () => {
    room.disconnect();
    while (container.childNodes.length > 1)
        container.removeChild(container.lastChild);
    button.innerHTML = 'Join call';
    connected = false;
    updateParticipantCount();
};

const submitButtonHandler = (event) => {
    event.preventDefault();
    if (!connected)
        connect();
    else
        disconnect();
};

const addParticipantDiv = (sid, name) => {
    var participant = document.createElement('div');
    participant.setAttribute('id', sid);
    participant.setAttribute('class', 'participant');

    var tracks = document.createElement('div');
    participant.appendChild(tracks);

    var label = document.createElement('div');
    label.innerHTML = name;
    participant.appendChild(label);

    container.appendChild(participant);
    return participant;
};

const participantConnected = (participant) => {
    var div = addParticipantDiv(participant.sid, participant.identity);

    participant.on('trackSubscribed', track => trackSubscribed(div, track));
    participant.on('trackUnsubscribed', trackUnsubscribed);

    participant.tracks.forEach(publication => {
        if (publication.isSubscribed)
            trackSubscribed(div, publication.track);
    });

    updateParticipantCount();
};

const participantDisconnected = (participant) => {
    document.getElementById(participant.sid).remove();
    updateParticipantCount();
};

const trackSubscribed = (div, track) => {
    div.firstChild.appendChild(track.attach());
};

const trackUnsubscribed = (track) => {
    track.detach().forEach(element => element.remove());
};

const updateParticipantCount = () => {
    if (!connected)
        count.innerHTML = 'Disconnected.';
    else
        count.innerHTML = (room.participants.size + 1) + ' participants online.';
};

const addLocalVideo = () => {
    Twilio.Video.createLocalVideoTrack({width: 240}).then(track => {
        var div = addParticipantDiv('local', 'Me');
        trackSubscribed(div, track);
        updateParticipantCount();
    });
};

addLocalVideo();
button.addEventListener('click', submitButtonHandler);
