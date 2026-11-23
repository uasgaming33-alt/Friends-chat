
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB5TR1YDX-XFemxNXVtzl4LEyAInTZXZOY",
  authDomain: "friends-chat-c182f.firebaseapp.com",
  databaseURL: "https://friends-chat-c182f-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "friends-chat-c182f",
  storageBucket: "friends-chat-c182f.firebasestorage.app",
  messagingSenderId: "280813121806",
  appId: "1:280813121806:web:36cc6e1d4c1b0b1cdca75f",
  measurementId: "G-FBMNYQ9F16"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const chatHeader = document.getElementById("chatHeader");

const params = new URLSearchParams(location.search);
const friendUid = params.get("uid");
const friendName = params.get("name") || "Friend";

let currentUser = null;
let stopMessages = null;

chatHeader.textContent = friendName;

function makeChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("__");
}

function showError(error) {
  console.error(error);
  alert(error.message || "Something went wrong");
}

function listenMessages() {
  const chatId = makeChatId(currentUser.uid, friendUid);

  const messagesQuery = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc")
  );

  stopMessages = onSnapshot(messagesQuery, snapshot => {
    messagesDiv.replaceChildren();

    snapshot.forEach(item => {
      const message = item.data();

      const box = document.createElement("div");
      box.className = "message";

      if (message.senderUid === currentUser.uid) {
        box.classList.add("mine");
      }

      const sender = document.createElement("div");
      sender.className = "sender";
      sender.textContent = message.senderUid === currentUser.uid
        ? "You"
        : friendName;

      const text = document.createElement("div");
      text.textContent = message.text || "";

      const time = document.createElement("div");
      time.className = "time";

      if (message.createdAt?.toDate) {
        time.textContent = message.createdAt.toDate().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        });
      }

      box.append(sender, text, time);
      messagesDiv.appendChild(box);
    });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }, showError);
}

async function sendMessage() {
  const text = messageInput.value.trim();

  if (!text || !currentUser || !friendUid) return;

  const chatId = makeChatId(currentUser.uid, friendUid);

  sendBtn.disabled = true;

  try {
    await addDoc(
      collection(db, "chats", chatId, "messages"),
      {
        text,
        name: currentUser.displayName || "Friend",
        senderUid: currentUser.uid,
        createdAt: serverTimestamp()
      }
    );

    messageInput.value = "";
  } catch (error) {
    showError(error);
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

onAuthStateChanged(auth, user => {
  if (!user) {
    location.href = "index.html";
    return;
  }

  if (!friendUid || friendUid === user.uid) {
    location.href = "chat.html";
    return;
  }

  currentUser = user;

  if (stopMessages) stopMessages();

  listenMessages();
});

