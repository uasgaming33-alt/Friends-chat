
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getDatabase,
  ref,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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
const rtdb = getDatabase(app);

const friendsList = document.getElementById("friendsList");

let currentUser = null;
let allUsers = [];
let requests = [];
let friendships = [];
let onlineUsers = {};

function makeChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("__");
}

function addHeading(text) {
  const heading = document.createElement("h3");
  heading.textContent = text;
  friendsList.appendChild(heading);
}

function addUserCard(user, statusText, buttons = []) {
  const card = document.createElement("div");
  card.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px;margin:8px 0;background:white;border-radius:10px;";

  const photo = document.createElement("img");
  photo.src = user.photoURL || "https://placehold.co/60x60";
  photo.alt = "Profile";
  photo.style.cssText = "width:48px;height:48px;border-radius:50%;object-fit:cover;";

  const info = document.createElement("div");
  info.style.flex = "1";

  const name = document.createElement("strong");
  name.textContent = user.name || "Friend";

  const status = document.createElement("div");
  status.textContent = statusText;
  status.style.fontSize = "12px";

  info.append(name, status);
  card.append(photo, info);

  buttons.forEach(item => {
    const button = document.createElement("button");
    button.textContent = item.label;
    button.onclick = item.action;
    card.appendChild(button);
  });

  friendsList.appendChild(card);
}

function renderFriends() {
  if (!friendsList || !currentUser) return;

  friendsList.replaceChildren();

  const myFriends = friendships.map(item => {
    const friendUid = item.members.find(uid => uid !== currentUser.uid);
    return allUsers.find(user => user.uid === friendUid);
  }).filter(Boolean);

  addHeading("My Friends");

  if (myFriends.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Abhi aapke koi friends nahi hain.";
    friendsList.appendChild(empty);
  }

  myFriends.forEach(friend => {
    const status = onlineUsers[friend.uid]?.state === "online" ? "Online" : "Offline";

    addUserCard(friend, status, [{
      label: "Chat",
      action: () => {
        const params = new URLSearchParams({
          uid: friend.uid,
          name: friend.name || "Friend"
        });
        location.href = "message.html?" + params.toString();
      }
    }]);
  });

  addHeading("Friend Requests");

  const incoming = requests.filter(request =>
    request.toUid === currentUser.uid && request.status === "pending"
  );

  if (incoming.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Koi new friend request nahi hai.";
    friendsList.appendChild(empty);
  }

  incoming.forEach(request => {
    const sender = allUsers.find(user => user.uid === request.fromUid) || {
      uid: request.fromUid,
      name: request.fromName || "Friend"
    };

    addUserCard(sender, "Friend request", [
      { label: "Accept", action: () => acceptRequest(request) },
      { label: "Reject", action: () => rejectRequest(request) }
    ]);
  });

  addHeading("All Users");

  const friendIds = new Set(myFriends.map(friend => friend.uid));

  allUsers
    .filter(user => user.uid !== currentUser.uid)
    .filter(user => !friendIds.has(user.uid))
    .forEach(user => {
      const sent = requests.some(request =>
        request.fromUid === currentUser.uid &&
        request.toUid === user.uid &&
        request.status === "pending"
      );

      const received = requests.some(request =>
        request.fromUid === user.uid &&
        request.toUid === currentUser.uid &&
        request.status === "pending"
      );

      let buttons = [];

      if (sent) {
        buttons = [{ label: "Request Sent", action: () => {} }];
      } else if (received) {
        buttons = [{ label: "Check Requests", action: () => {} }];
      } else {
        buttons = [{
          label: "Add Friend",
          action: () => sendRequest(user)
        }];
      }

      addUserCard(user, "Friends Chat user", buttons);
    });
}

async function sendRequest(friend) {
  try {
    await addDoc(collection(db, "friendRequests"), {
      fromUid: currentUser.uid,
      fromName: currentUser.displayName || "Friend",
      toUid: friend.uid,
      toName: friend.name || "Friend",
      status: "pending",
      createdAt: serverTimestamp()
    });
    alert("Friend request sent!");
  } catch (error) {
    alert(error.message);
  }
}

async function acceptRequest(request) {
  try {
    const chatId = makeChatId(request.fromUid, request.toUid);

    await updateDoc(doc(db, "friendRequests", request.id), {
      status: "accepted"
    });

    await setDoc(doc(db, "friendships", chatId), {
      members: [request.fromUid, request.toUid].sort(),
      createdAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, "chats", chatId), {
      members: [request.fromUid, request.toUid].sort(),
      createdAt: serverTimestamp()
    }, { merge: true });

    alert("Friend request accepted!");
  } catch (error) {
    alert(error.message);
  }
}

async function rejectRequest(request) {
  try {
    await updateDoc(doc(db, "friendRequests", request.id), {
      status: "rejected"
    });
  } catch (error) {
    alert(error.message);
  }
}

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    location.href = "index.html";
  };
}

onAuthStateChanged(auth, user => {
  if (!user) {
    location.href = "index.html";
    return;
  }

  currentUser = user;

  onSnapshot(collection(db, "users"), snapshot => {
    allUsers = snapshot.docs.map(item => ({
      uid: item.id,
      ...item.data()
    }));
    renderFriends();
  });

  onSnapshot(
    query(collection(db, "friendRequests"), where("toUid", "==", user.uid)),
    incoming => {
      const incomingRequests = incoming.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      onSnapshot(
        query(collection(db, "friendRequests"), where("fromUid", "==", user.uid)),
        outgoing => {
          const outgoingRequests = outgoing.docs.map(item => ({
            id: item.id,
            ...item.data()
          }));
          requests = [...incomingRequests, ...outgoingRequests];
          renderFriends();
        }
      );
    }
  );

  onSnapshot(
    query(collection(db, "friendships"), where("members", "array-contains", user.uid)),
    snapshot => {
      friendships = snapshot.docs.map(item => item.data());
      renderFriends();
    }
  );

  onValue(ref(rtdb, "status"), snapshot => {
    onlineUsers = snapshot.val() || {};
    renderFriends();
  });
});

