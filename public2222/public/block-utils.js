import { auth, db } from "./firebase-init.js";
import {
  doc, setDoc, serverTimestamp, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function blockUser(blockedUid, reason = "altul", details = ""){
  const me = auth.currentUser;
  if (!me) throw new Error("Not logged in");
  if (!blockedUid) throw new Error("Missing blockedUid");

  await setDoc(doc(db, "users", me.uid, "blocks", blockedUid), {
    blockedUid,
    reason,
    details,
    createdAt: serverTimestamp()
  });
}

export async function unblockUser(blockedUid){
  const me = auth.currentUser;
  if (!me) throw new Error("Not logged in");
  await deleteDoc(doc(db, "users", me.uid, "blocks", blockedUid));
}

export async function isBlockedByMe(otherUid){
  const me = auth.currentUser;
  if (!me) return false;
  const snap = await getDoc(doc(db, "users", me.uid, "blocks", otherUid));
  return snap.exists();
}