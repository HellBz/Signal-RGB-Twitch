const clientId = 'kffl4m23apylc95ljz5tepdaib2r51';
const redirectUri = 'https://hellbz.github.io/Signal-RGB-Twitch';
const scopes = 'user:read:email channel:read:subscriptions'; // Beispiel-Scopes

let pingInterval;
let reconnectTimeout;

function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.hash.substr(1));
    return params.get('access_token');
}

function storeToken(token) {
    localStorage.setItem('twitch_token', token);
}

function getStoredToken() {
    return localStorage.getItem('twitch_token');
}

function isTokenExpired() {
    const storedTime = localStorage.getItem('token_time');
    if (!storedTime) return true;
    const currentTime = new Date().getTime();
    const elapsed = currentTime - storedTime;
    return elapsed > 3600000; // 1 Stunde in Millisekunden
}

function redirectToTwitchLogin() {
    const authUrl = `https://id.twitch.tv/oauth2/authorize?response_type=token&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}`;
    window.location.href = authUrl;
}

function logout() {
    localStorage.removeItem('twitch_token');
    localStorage.removeItem('token_time');
    localStorage.removeItem('user_id');
    document.getElementById('status').innerText = 'Logged out';
    document.getElementById('login-button').style.display = 'block';
    document.getElementById('logout-button').style.display = 'none';
    const eventList = document.getElementById('event-list');
    eventList.innerHTML = '';
    clearInterval(pingInterval);
    clearTimeout(reconnectTimeout);
}

async function fetchUserId(token) {
    const response = await fetch('https://api.twitch.tv/helix/users', {
        headers: {
            'Authorization': 'Bearer ' + token,
            'Client-ID': clientId
        }
    });
    const data = await response.json();
    if (data.data && data.data.length > 0) {
        return data.data[0].id;
    } else {
        throw new Error('Failed to fetch user ID');
    }
}

async function initialize() {
    const token = getTokenFromUrl();
    if (token) {
        storeToken(token);
        localStorage.setItem('token_time', new Date().getTime());
        window.location.hash = '';
        showOverlay('Successfully logged in!');
        const userId = await fetchUserId(token);
        localStorage.setItem('user_id', userId);
        document.getElementById('status').innerText = 'Token gespeichert!';
        document.getElementById('login-button').style.display = 'none';
        document.getElementById('logout-button').style.display = 'block';
        connectToWebSocket(token, userId);
    } else {
        const storedToken = getStoredToken();
        if (!storedToken || isTokenExpired()) {
            document.getElementById('login-button').style.display = 'block';
            document.getElementById('logout-button').style.display = 'none';
        } else {
            const userId = await fetchUserId(storedToken);
            localStorage.setItem('user_id', userId);
            document.getElementById('status').innerText = 'Gültiger Token gefunden!';
            document.getElementById('login-button').style.display = 'none';
            document.getElementById('logout-button').style.display = 'block';
            connectToWebSocket(storedToken, userId);
        }
    }
}

function connectToWebSocket(token, userId) {
    const socket = new WebSocket('wss://pubsub-edge.twitch.tv');

    socket.onopen = () => {
        document.getElementById('status').innerText = 'WebSocket verbunden!';
        listenToTopics(socket, token, userId);

        // Start sending PING every 5 minutes
        pingInterval = setInterval(() => {
            socket.send(JSON.stringify({ type: 'PING' }));
        }, 300000); // 300000 ms = 5 minutes
    };

    socket.onmessage = (event) => {
        console.log('Message from server:', event.data);
        const message = JSON.parse(event.data);
        if (message.type === 'RECONNECT') {
            handleReconnect(socket, token, userId);
        } else {
            handlePubSubMessage(message);
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
    };

    socket.onclose = () => {
        document.getElementById('status').innerText = 'WebSocket getrennt!';
        clearInterval(pingInterval);
    };
}

function handleReconnect(socket, token, userId) {
    clearInterval(pingInterval);
    document.getElementById('status').innerText = 'Reconnecting...';
    reconnectTimeout = setTimeout(() => {
        connectToWebSocket(token, userId);
    }, 120000); // 120000 ms = 2 minutes
}

function listenToTopics(socket, token, userId) {
    const topic = `channel-subscribe-events-v1.${userId}`;
    const message = {
        type: 'LISTEN',
        nonce: generateNonce(),
        data: {
            topics: [topic],
            auth_token: token
        }
    };
    socket.send(JSON.stringify(message));
}

function handlePubSubMessage(message) {
    if (message.type === 'MESSAGE') {
        const topic = message.data.topic;
        const msgData = JSON.parse(message.data.message);
        console.log(`New message on topic ${topic}:`, msgData);
        addEventToList(`New event: ${JSON.stringify(msgData)}`);
    } else if (message.type === 'RESPONSE') {
        if (message.error) {
            console.error('Error listening to topic:', message.error);
        } else {
            console.log('Successfully listening to topic');
        }
    }
}

function generateNonce() {
    return Math.random().toString(36).substring(2) + (new Date()).getTime().toString(36);
}

function showOverlay(message) {
    const overlay = document.getElementById('login-overlay');
    overlay.innerText = message;
    overlay.classList.add('show');
    setTimeout(() => {
        overlay.classList.remove('show');
    }, 3000);
}

function addEventToList(eventText) {
    const eventList = document.getElementById('event-list');
    const listItem = document.createElement('li');
    listItem.className = 'list-group-item';
    listItem.innerText = eventText;
    eventList.insertBefore(listItem, eventList.firstChild);
}

document.getElementById('login-button').addEventListener('click', redirectToTwitchLogin);
document.getElementById('logout-button').addEventListener('click', logout);
window.onload = initialize;
