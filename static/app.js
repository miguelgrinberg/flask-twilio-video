const usernameInput = document.getElementById('username');
const button = document.getElementById('join_leave');
const shareScreen = document.getElementById('share_screen');
const container = document.getElementById('container');
const count = document.getElementById('count');
let connected = false;
let room;
let screenTrack;

const AudioContext = window.AudioContext || window.webkitAudioContext;
const RANGE = 2;
var map = [];

var audioCtx;

function addLocalVideo() {
    Twilio.Video.createLocalVideoTrack().then(track => {
        let video = document.getElementById('local').firstChild;
        let trackElement = track.attach();
        trackElement.addEventListener('click', () => { zoomTrack(trackElement); });
        video.appendChild(trackElement);
    });
};

function connectButtonHandler(event) {
    event.preventDefault();
    if (!connected) {
        let username = usernameInput.value;
        if (!username) {
            alert('Enter your name before connecting');
            return;
        }
        button.disabled = true;
        button.innerHTML = 'Connecting...';
        connect(username).then(() => {
            button.innerHTML = 'Leave call';
            button.disabled = false;
            shareScreen.disabled = false;
        }).catch(() => {
            alert('Connection failed. Is the backend running?');
            button.innerHTML = 'Join call';
            button.disabled = false;
        });
    }
    else {
        disconnect();
        button.innerHTML = 'Join call';
        connected = false;
        shareScreen.innerHTML = 'Share screen';
        shareScreen.disabled = true;
    }
};

function connect(username) {
    let promise = new Promise((resolve, reject) => {
        // get a token from the back end
        fetch('/login', {
            method: 'POST',
            body: JSON.stringify({'username': username})
        }).then(res => res.json()).then(data => {
            // join video call
            return Twilio.Video.connect(data.token);
        }).then(_room => {
            room = _room;
            room.participants.forEach(participantConnected);
            room.on('participantConnected', participantConnected);
            room.on('participantDisconnected', participantDisconnected);
            connected = true;
            updateParticipantCount();
            resolve();
        }).catch(() => {
            reject();
        });
    });
    return promise;
};

function updateParticipantCount() {
    if (!connected)
        count.innerHTML = 'Disconnected.';
    else
        count.innerHTML = (room.participants.size + 1) + ' participants online.';
};

class Entry {
    constructor(id, panNode) {
      this.id = id;
      this.panNode = panNode;
    }
}

function addPersonToTable(id, panNode) {
    map.push(new Entry(id, panNode));
    let n = roundTable.length;

    if (n == 1) {
        panNode.pan.setValueAtTime(0, audioCtx.currentTime);
    } else {
        let step = RANGE / (n - 1);
        // reassign all panNode values (ratios)
        for (let i = 0; i < n; i++) {
            map[i].panNode.pan.setValueAtTime(-1 + step * i, audioCtx.currentTime);
        }
    }
}

function allowDrop(ev) {
    ev.preventDefault();
}
  
function drag(ev) {
    ev.dataTransfer.setData("text", ev.target.parentElement.parentElement.id);
}


function drop(ev) {
    // swap divs
    ev.preventDefault();
    let srcId = ev.dataTransfer.getData("text");
    var src = document.getElementById(srcId);
    var prevChair = src.parentNode;
    var dest = ev.currentTarget.firstElementChild;

    ev.currentTarget.replaceChild(src, dest);
    prevChair.appendChild(dest);

    // swap panNodes in map
    let destId = dest.id;
    // find srcIndex and destIndex
    let srcIndex, destIndex;
    for (let i = 0; i < map.length; i++) {
        if (map[i].id === srcId)
            srcIndex = i;
        else if (map[i].id === destId)
            destIndex = i;
        else if (srcIndex && destIndex)
            break;
    }
    
    // swap the pan node values
    let step = 2 / (map.length - 1);
    map[srcIndex].panNode.pan.setValueAtTime(-1 + step * destIndex, audioCtx.currentTime);
    map[destIndex].panNode.pan.setValueAtTime(-1 + step * srcIndex, audioCtx.currentTime);

    let temp = map[srcIndex];
    map[srcIndex] = map[destIndex];
    map[destIndex] = temp;
}

function participantConnected(participant) {
    let chair = document.createElement('div');
    chair.setAttribute('class', 'chair');
    chair.setAttribute('ondrop', 'drop(event)');
    chair.setAttribute('ondragover', 'allowDrop(event)')

    let participantDiv = document.createElement('div');
    participantDiv.setAttribute('id', participant.sid);
    participantDiv.setAttribute('class', 'participant');
    participantDiv.setAttribute('draggable', 'true');
    participantDiv.setAttribute('ondragstart', 'drag(event)');

    let tracksDiv = document.createElement('div');
    participantDiv.appendChild(tracksDiv);

    let labelDiv = document.createElement('div');
    labelDiv.setAttribute('class', 'label');
    labelDiv.innerHTML = participant.identity;
    participantDiv.appendChild(labelDiv);

    chair.appendChild(participantDiv);
    container.appendChild(chair);

    participant.tracks.forEach(publication => {
        if (publication.isSubscribed)
            trackSubscribed(tracksDiv, publication.track);
    });

    if (!audioCtx) {
        try {
            audioCtx = new AudioContext();
        }
        catch(e) {
            alert('Web Audio API is not supported in this browser');
        }
    }

    // Possible error if no <audio> element
    let audio = tracksDiv.getElementsByTagName('audio')[0];

    let source = audioCtx.createMediaElementSource(audio);
    let panNode = audioCtx.createStereoPanner();

    source.connect(panNode);
    panNode.connect(audioCtx.destination);
    addPersonToTable(participant.sid, panNode);

    participant.on('trackSubscribed', track => trackSubscribed(tracksDiv, track));
    participant.on('trackUnsubscribed', trackUnsubscribed);

    updateParticipantCount();
};

function participantDisconnected(participant) {
    document.getElementById(participant.sid).parentElement.remove();
    for (let i = 0; i < map.length; i++) {
        if (map[i].id === participant.sid) {
            map.splice(i, 1);
            break;
        }
    }
    updateParticipantCount();
};

function trackSubscribed(div, track) {
    let trackElement = track.attach();
    trackElement.addEventListener('click', () => { zoomTrack(trackElement); });
    div.appendChild(trackElement);
};

function trackUnsubscribed(track) {
    track.detach().forEach(element => {
        if (element.classList.contains('participantZoomed')) {
            zoomTrack(element);
        }
        element.remove()
    });
};

function disconnect() {
    room.disconnect();
    while (container.lastChild.id != 'local')
        container.removeChild(container.lastChild);
    button.innerHTML = 'Join call';
    connected = false;
    updateParticipantCount();
};

function shareScreenHandler() {
    event.preventDefault();
    if (!screenTrack) {
        navigator.mediaDevices.getDisplayMedia().then(stream => {
            screenTrack = new Twilio.Video.LocalVideoTrack(stream.getTracks()[0]);
            room.localParticipant.publishTrack(screenTrack);
            screenTrack.mediaStreamTrack.onended = () => { shareScreenHandler() };
            console.log(screenTrack);
            shareScreen.innerHTML = 'Stop sharing';
        }).catch(() => {
            alert('Could not share the screen.')
        });
    }
    else {
        room.localParticipant.unpublishTrack(screenTrack);
        screenTrack.stop();
        screenTrack = null;
        shareScreen.innerHTML = 'Share screen';
    }
};

function zoomTrack(trackElement) {
    if (!trackElement.classList.contains('participantZoomed')) {
        // zoom in
        container.childNodes.forEach(participant => {
            if (participant.className == 'participant') {
                participant.childNodes[0].childNodes.forEach(track => {
                    if (track === trackElement) {
                        track.classList.add('participantZoomed')
                    }
                    else {
                        track.classList.add('participantHidden')
                    }
                });
                participant.childNodes[1].classList.add('participantHidden');
            }
        });
    }
    else {
        // zoom out
        container.childNodes.forEach(participant => {
            if (participant.className == 'participant') {
                participant.childNodes[0].childNodes.forEach(track => {
                    if (track === trackElement) {
                        track.classList.remove('participantZoomed');
                    }
                    else {
                        track.classList.remove('participantHidden');
                    }
                });
                participant.childNodes[1].classList.remove('participantHidden');
            }
        });
    }
};

addLocalVideo();
button.addEventListener('click', connectButtonHandler);
shareScreen.addEventListener('click', shareScreenHandler);
