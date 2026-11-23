
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
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
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getDatabase,
  ref,
  onValue,
  set,
  onDisconnect,
  serverTimestamp as rtdbTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// FIREBASE CONFIG
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

const $ = id => document.getElementById(id);

let selectedFriend = null;
let selectedChatId = null;

let stopMessages = null;
let stopUsers = null;
let stopRequests = null;
let stopOutgoing = null;
let stopFriends = null;
let stopStatus = null;
let stopTyping = null;

let typingTimer = null;

let allUsers = [];
let incomingRequests = [];
let outgoingRequests = [];
let myFriends = [];
let friendStatuses = {};

// ONLINE STATUS
function setupOnlineStatus(user) {
  const connectedRef = ref(rtdb, ".info/connected");
  const statusRef = ref(rtdb, "status/" + user.uid);

  onValue(connectedRef, async snapshot => {
    if (snapshot.val() === true) {
      try {
        await onDisconnect(statusRef).set({
          state: "offline",
          lastChanged: rtdbTimestamp()
        });

        await set(statusRef, {
          state: "online",
          lastChanged: rtdbTimestamp()
        });
      } catch (error) {
        console.error("Presence Error:", error);
      }
    }
  });
}

// FRIEND STATUS LISTENER
function startStatusListener() {
  if (stopStatus) stopStatus();

  stopStatus = onValue(ref(rtdb, "status"), snapshot => {
    friendStatuses = snapshot.val() || {};
    renderFriends();
  }, showError);
}

// CREATE CHAT ID
function makeChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("__");
}

// STOP TYPING
async function setTyping(isTyping, chatId = selectedChatId) {
  if (!auth.currentUser || !chatId) return;

  const typingRef = ref(
    rtdb,
    "typing/" + chatId + "/" + auth.currentUser.uid
  );

  try {
    if (isTyping) {
      await onDisconnect(typingRef).set(false);
    }

    await set(typingRef, isTyping);
  } catch (error) {
    console.error("Typing Error:", error);
  }
}

// LISTEN TO FRIEND TYPING
function startTypingListener() {
  if (stopTyping) {
    stopTyping();
    stopTyping = null;
  }

  $("typingIndicator").textContent = "";

  if (!selectedChatId) return;

  const typingRef = ref(
    rtdb,
    "typing/" + selectedChatId
  );

  stopTyping = onValue(typingRef, snapshot => {
    const typingUsers = snapshot.val() || {};

    const friendTyping =
      selectedFriend &&
      typingUsers[selectedFriend.uid] === true;

    $("typingIndicator").textContent =
      friendTyping ? "Typing..." : "";
  }, showError);
}

// HANDLE MESSAGE INPUT
$("messageInput").addEventListener("input", () => {
  if (!selectedChatId) return;

  clearTimeout(typingTimer);

  const isTyping =
    $("messageInput").value.trim().length > 0;

  setTyping(isTyping);

  if (isTyping) {
    typingTimer = setTimeout(() => {
      setTyping(false);
    }, 1500);
  }
});

// STOP TYPING ON BLUR
$("messageInput").addEventListener("blur", () => {
  clearTimeout(typingTimer);
  setTyping(false);
});

// STOP OLD LISTENERS
function stopListeners() {
  [
    stopUsers,
    stopRequests,
    stopOutgoing,
    stopFriends,
    stopMessages,
    stopStatus,
    stopTyping
  ].forEach(stop => {
    if (stop) stop();
  });

  stopUsers = null;
  stopRequests = null;
  stopOutgoing = null;
  stopFriends = null;
  stopMessages = null;
  stopStatus = null;
  stopTyping = null;

  clearTimeout(typingTimer);

  if ($("typingIndicator")) {
    $("typingIndicator").textContent = "";
  }
}

// PROFILE PHOTO
async function loadProfilePhoto() {
  if (!auth.currentUser) return;

  try {
    const snap = await getDoc(
      doc(db, "profiles", auth.currentUser.uid)
    );

    if (snap.exists() && snap.data().photoURL) {
      $("profilePhoto").src = snap.data().photoURL;
    }
  } catch (error) {
    console.error(error);
  }
}

// SHOW CHAT
function showChat() {
  $("authSection").hidden = true;
  $("chatSection").hidden = false;

  $("chatHeader").textContent = "Select a friend to chat";
  $("messages").innerHTML = "";
  $("typingIndicator").textContent = "";

  loadProfilePhoto();
  startListeners();
  startStatusListener();
}

// FRIEND LISTENERS
function startListeners() {
  stopListeners();

  const uid = auth.currentUser.uid;

stopUsers = onSnapshot(collection(db, "users"), async snapshot => {
  try {
    allUsers = await Promise.all(
      snapshot.docs.map(async d => {
        const userData = d.data();

        // पहले users collection से फोटो लो
        if (userData.photoURL) {
          return userData;
        }

        // फोटो नहीं मिली तो profiles collection चेक करो
        const profileSnap = await getDoc(
          doc(db, "profiles", d.id)
        );

        if (profileSnap.exists()) {
          return {
            ...userData,
            photoURL: profileSnap.data().photoURL || ""
          };
        }

        return userData;
      })
    );

    renderFriends();

  } catch (error) {
    showError(error);
  }
}, showError);
  
  stopRequests = onSnapshot(
    query(
      collection(db, "friendRequests"),
      where("toUid", "==", uid)
    ),
    snapshot => {
      incomingRequests = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.status === "pending");

      renderFriends();
    },
    showError
  );

  stopOutgoing = onSnapshot(
    query(
      collection(db, "friendRequests"),
      where("fromUid", "==", uid)
    ),
    snapshot => {
      outgoingRequests = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.status === "pending");

      renderFriends();
    },
    showError
  );

  stopFriends = onSnapshot(
    query(
      collection(db, "friendships"),
      where("members", "array-contains", uid)
    ),
    snapshot => {
      myFriends = snapshot.docs.map(d => d.data());
      renderFriends();
    },
    showError
  );
}

function showError(error) {
  console.error(error);
  alert("Firebase Error: " + error.message);
}

// RENDER FRIENDS
function renderFriends() {
  const list = $("friendsList");
  list.innerHTML = "";

  const requestTitle = document.createElement("h3");
  requestTitle.textContent = "Friend Requests";
  list.appendChild(requestTitle);

  if (!incomingRequests.length) {
    const empty = document.createElement("p");
    empty.textContent = "No new requests";
    list.appendChild(empty);
  }

  incomingRequests.forEach(request => {
    const row = document.createElement("div");
    row.className = "friend-item";

    const name = document.createElement("span");
    name.textContent = request.fromName || "Friend";

    const accept = document.createElement("button");
    accept.textContent = "Accept";
    accept.onclick = () => acceptRequest(request);

    const reject = document.createElement("button");
    reject.textContent = "Reject";
    reject.onclick = () => rejectRequest(request);

    row.append(name, accept, reject);
    list.appendChild(row);
  });

  const friendsTitle = document.createElement("h3");
  friendsTitle.textContent = "My Friends";
  list.appendChild(friendsTitle);

  const myUid = auth.currentUser.uid;

  myFriends.forEach(friendship => {
    const friendUid = friendship.members.find(
      id => id !== myUid
    );

    const friend = allUsers.find(
      u => u.uid === friendUid
    );

    if (!friend) return;

    const row = document.createElement("div");
    row.className = "friend-item";

    const img = document.createElement("img");
    img.src = friend.photoURL || "https://placehold.co/50x50";
    img.alt = "Profile";

    const name = document.createElement("span");
    name.textContent = friend.name || "Friend";

    const status = document.createElement("small");

    const online =
      friendStatuses[friendUid]?.state === "online";

    status.textContent = online
      ? " 🟢 Online"
      : " ⚫ Offline";

    const chatButton = document.createElement("button");
    chatButton.textContent = "Chat";
    chatButton.onclick = () => openPrivateChat(friend);

    row.append(img, name, status, chatButton);
    list.appendChild(row);
  });

  const usersTitle = document.createElement("h3");
  usersTitle.textContent = "All Users";
  list.appendChild(usersTitle);

  allUsers.forEach(friend => {
    if (friend.uid === myUid) return;

    const row = document.createElement("div");
    row.className = "friend-item";

    const img = document.createElement("img");
    img.src = friend.photoURL || "https://placehold.co/50x50";

    const name = document.createElement("span");
    name.textContent = friend.name || "Friend";

    const isFriend = myFriends.some(
      f => f.members.includes(friend.uid)
    );

    const incoming = incomingRequests.find(
      r => r.fromUid === friend.uid
    );

    const outgoing = outgoingRequests.some(
      r => r.toUid === friend.uid
    );

    const button = document.createElement("button");

    if (isFriend) {
      button.textContent = "Friends";
      button.disabled = true;
    } else if (incoming) {
      button.textContent = "Accept Request";
      button.onclick = () => acceptRequest(incoming);
    } else if (outgoing) {
      button.textContent = "Request Sent";
      button.disabled = true;
    } else {
      button.textContent = "Add Friend";
      button.onclick = () => sendRequest(friend);
    }

    row.append(img, name, button);
    list.appendChild(row);
  });
}

// SEND FRIEND REQUEST
async function sendRequest(friend) {
  const uid = auth.currentUser.uid;

  try {
    await addDoc(collection(db, "friendRequests"), {
      fromUid: uid,
      fromName: auth.currentUser.displayName || "Friend",
      toUid: friend.uid,
      toName: friend.name || "Friend",
      status: "pending",
      createdAt: serverTimestamp()
    });

    alert("Friend Request Sent!");
  } catch (error) {
    showError(error);
  }
}

// ACCEPT REQUEST
async function acceptRequest(request) {
  try {
    const uid = auth.currentUser.uid;

    const chatId = makeChatId(uid, request.fromUid);
    const members = [uid, request.fromUid].sort();

    await setDoc(doc(db, "friendships", chatId), {
      members,
      createdAt: serverTimestamp()
    });

    await setDoc(
      doc(db, "chats", chatId),
      {
        members,
        createdAt: serverTimestamp()
      },
      { merge: true }
    );

    await updateDoc(
      doc(db, "friendRequests", request.id),
      { status: "accepted" }
    );

    alert("Friend Request Accepted Successfully!");
  } catch (error) {
    alert(error.message);
  }
}

// REJECT REQUEST
async function rejectRequest(request) {
  try {
    await updateDoc(
      doc(db, "friendRequests", request.id),
      { status: "rejected" }
    );

    alert("Request Rejected");
  } catch (error) {
    showError(error);
  }
}

// OPEN PRIVATE CHAT
async function openPrivateChat(friend) {
  const oldChatId = selectedChatId;

  clearTimeout(typingTimer);

  if (oldChatId && auth.currentUser) {
    await setTyping(false, oldChatId);
  }

  selectedFriend = friend;

  selectedChatId = makeChatId(
    auth.currentUser.uid,
    friend.uid
  );

  $("chatHeader").textContent =
    "Chat with " + (friend.name || "Friend");

  $("typingIndicator").textContent = "";

  if (stopMessages) {
    stopMessages();
    stopMessages = null;
  }

  startTypingListener();

  const messagesRef = collection(
    db,
    "chats",
    selectedChatId,
    "messages"
  );

  const q = query(
    messagesRef,
    orderBy("createdAt", "asc")
  );

  stopMessages = onSnapshot(q, snapshot => {
    const box = $("messages");
    box.innerHTML = "";

    snapshot.forEach(messageDoc => {
      const data = messageDoc.data();

      const div = document.createElement("div");

      div.className =
        "message " +
        (data.senderUid === auth.currentUser.uid
          ? "my-message"
          : "friend-message");

      const name = document.createElement("strong");
      name.textContent = data.name || "Friend";

      const text = document.createElement("div");
      text.textContent = data.text || "";

      const time = document.createElement("small");

      if (data.createdAt) {
        time.textContent = data.createdAt
          .toDate()
          .toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          });
      } else {
        time.textContent = "Sending...";
      }

      div.append(name, text, time);
      box.appendChild(div);
    });

    box.scrollTop = box.scrollHeight;
  }, showError);
}

// SEND PRIVATE MESSAGE
async function sendMessage() {
  const input = $("messageInput");
  const message = input.value.trim();

  if (!message || !auth.currentUser) return;

  if (!selectedChatId || !selectedFriend) {
    alert("पहले कोई Friend चुनो!");
    return;
  }

  try {
    clearTimeout(typingTimer);
    await setTyping(false);

    await addDoc(
      collection(db, "chats", selectedChatId, "messages"),
      {
        text: message,
        name: auth.currentUser.displayName || "Friend",
        senderUid: auth.currentUser.uid,
        createdAt: serverTimestamp()
      }
    );

    input.value = "";
  } catch (error) {
    showError(error);
  }
}

$("sendBtn").onclick = sendMessage;

$("messageInput").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

// SIGN UP
$("signupBtn").onclick = async () => {
  try {
    const name = $("name").value.trim();
    const email = $("email").value.trim();
    const password = $("password").value;

    if (!name || !email || !password) {
      alert("Name, Email और Password भरो।");
      return;
    }

    const result = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await updateProfile(result.user, {
      displayName: name
    });

    await setDoc(doc(db, "users", result.user.uid), {
      uid: result.user.uid,
      name,
      photoURL: "",
      createdAt: serverTimestamp()
    });

  } catch (error) {
    alert(error.message);
  }
};

// LOGIN
$("loginBtn").onclick = async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );
  } catch (error) {
    alert(error.message);
  }
};

// LOGOUT
$("logoutBtn").onclick = async () => {
  try {
    clearTimeout(typingTimer);
    await setTyping(false);

    stopListeners();

    selectedFriend = null;
    selectedChatId = null;

    await signOut(auth);
  } catch (error) {
    showError(error);
  }
};

// PROFILE PHOTO UPLOAD
$("uploadPhotoBtn").onclick = async () => {
  const file = $("photoInput").files[0];

  if (!file || !auth.currentUser) {
    alert("पहले Login करो और Photo चुनो!");
    return;
  }

  if (!file.type.startsWith("image/")) {
    alert("सिर्फ Image चुनो!");
    return;
  }

  if (file.size > 300 * 1024) {
    alert("Photo 300 KB से छोटी रखो!");
    return;
  }

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const photo = reader.result;

      await setDoc(
        doc(db, "profiles", auth.currentUser.uid),
        { photoURL: photo },
        { merge: true }
      );

      await setDoc(
        doc(db, "users", auth.currentUser.uid),
        { photoURL: photo },
        { merge: true }
      );

      $("profilePhoto").src = photo;

      alert("Profile Photo Save हो गई!");
    } catch (error) {
      showError(error);
    }
  };

  reader.readAsDataURL(file);
};

// AUTH STATE
onAuthStateChanged(auth, async user => {
  if (user) {
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          uid: user.uid,
          name: user.displayName || "Friend"
        },
        { merge: true }
      );

      setupOnlineStatus(user);
location.replace("chat.html");

    } catch (error) {
      showError(error);
    }
  } else {
    stopListeners();

    selectedFriend = null;
    selectedChatId = null;

    $("authSection").hidden = false;
    $("chatSection").hidden = true;
  }
});
