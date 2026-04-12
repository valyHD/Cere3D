import { auth, db, storage } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  ref as sRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { initNavAuth } from "./nav-auth.js";

initNavAuth();

function $(id){ return document.getElementById(id); }
function val(id){ return ($(id)?.value ?? "").toString().trim(); }

function norm(s){
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function fmtBytes(b){
  if (!Number.isFinite(b)) return "";
  const u=["B","KB","MB","GB"];
  let i=0,n=b;
  while(n>=1024 && i<u.length-1){ n/=1024;i++; }
  return `${n.toFixed(i===0?0:1)} ${u[i]}`;
}

const qs = new URLSearchParams(location.search);
const cerereId = qs.get("id");

let currentUser=null;
let docRef=null;
let data=null;
let currentPhotos=[];
let currentModel=null;

const statusEl=$("status");
const btnSave=$("btnSaveCerere");

function setStatus(t){ if(statusEl) statusEl.textContent=t||""; }

/* =========================
   PREVIEW UPLOAD NOU
========================= */

const photosInput=$("c_photos");
const photosMeta=$("photosMeta");
const photosPreview=$("photosPreview");

const modelInput=$("c_model3d");
const modelMeta=$("modelMeta");

photosInput?.addEventListener("change",()=>{
  const files=[...photosInput.files||[]];

  if(!files.length){
    photosMeta.style.display="none";
    photosPreview.style.display="none";
    return;
  }

  const total=files.reduce((s,f)=>s+(f.size||0),0);
  photosMeta.textContent=`Selectat: ${files.length} poza(e) • ${fmtBytes(total)}`;
  photosMeta.style.display="block";

  photosPreview.innerHTML="";
  files.slice(0,8).forEach(f=>{
    if(!f.type?.startsWith("image/")) return;
    const url=URL.createObjectURL(f);
    const wrap=document.createElement("div");
    wrap.className="ph";
    const img=document.createElement("img");
    img.src=url;
    img.onload=()=>URL.revokeObjectURL(url);
    wrap.appendChild(img);
    photosPreview.appendChild(wrap);
  });

  photosPreview.style.display="grid";
});

modelInput?.addEventListener("change",()=>{
  const f=modelInput.files?.[0];
  if(!f){
    modelMeta.style.display="none";
    return;
  }
  modelMeta.textContent=`Fisier selectat: ${f.name} • ${fmtBytes(f.size||0)}`;
  modelMeta.style.display="block";
});

/* =========================
   STORAGE HELPERS
========================= */

function storageRefFromAny(u){
  try{ return sRef(storage,u);}catch{ return null;}
}

async function deleteFromStorageBestEffort(item){
  try{
    let r=null;
    if(item?.storagePath) r=sRef(storage,item.storagePath);
    else if(item?.url) r=storageRefFromAny(item.url);
    else if(typeof item==="string") r=storageRefFromAny(item);
    if(r) await deleteObject(r);
  }catch(e){
    console.warn("delete warning",e);
  }
}

async function uploadModelFile(id,file){
  const safe=`${Date.now()}_${file.name}`.replace(/\s+/g,"_");
  const path=`cereri/${id}/model/${safe}`;
  const r=sRef(storage,path);
  await uploadBytes(r,file);
  const url=await getDownloadURL(r);
  return {url,name:file.name,size:file.size,storagePath:path};
}

async function uploadPhotos(id,fileList){
  const files=[...fileList||[]];
  const out=[];
  for(const file of files){
    const uid=crypto.randomUUID?.()||Date.now();
    const safe=`${uid}_${file.name}`.replace(/\s+/g,"_");
    const path=`cereri/${id}/photos/${safe}`;
    const r=sRef(storage,path);
    await uploadBytes(r,file);
    const url=await getDownloadURL(r);
    out.push({url,name:file.name,size:file.size,storagePath:path});
  }
  return out;
}

/* =========================
   LOAD DATA
========================= */

function fillForm(d){
  $("c_title").value=d.title||"";
  $("c_description").value=d.description||"";
  $("c_county").value=d.county||"";
  $("c_have3d").value=d.have3d||"Nu am fisier, vreau sa il modeleze cineva";
  $("c_refurl").value=d.referenceUrl||"";
}

onAuthStateChanged(auth,async(u)=>{
  currentUser=u;
  if(!u){ setStatus("Autentificare necesara."); btnSave.disabled=true; return;}

  docRef=doc(db,"cereri",cerereId);
  const snap=await getDoc(docRef);
  if(!snap.exists()){ setStatus("Cerere inexistenta."); return;}

  data=snap.data();
  if(data.createdBy!==u.uid){ setStatus("Nu ai drepturi."); return;}

  currentPhotos=data.photos||[];
  currentModel=data.modelFile||null;

  fillForm(data);

  document.body.classList.remove("auth-loading");
});

/* =========================
   SAVE
========================= */

btnSave?.addEventListener("click",async()=>{
  if(!currentUser||!docRef) return;

  const county=val("c_county");
  const title=val("c_title");
  const description=val("c_description");

  if(!county){ setStatus("Selecteaza judetul."); return;}
  if(title.length<6){ setStatus("Titlu prea scurt."); return;}
  if(description.length<10){ setStatus("Descriere prea scurta."); return;}

  btnSave.disabled=true;
  setStatus("Se salveaza...");

  try{
    const payload={
      title,
      category:val("c_category"),
      description,
      county,
      pickup:val("c_pickup"),
      deadline:val("c_deadline"),
      budget:val("c_budget"),
      have3d:val("c_have3d"),
      referenceUrl:val("c_refurl"),
      updatedAt:serverTimestamp()
    };

    const newModel=$("c_model3d")?.files?.[0];
    if(newModel){
      await deleteFromStorageBestEffort(currentModel);
      payload.modelFile=await uploadModelFile(cerereId,newModel);
    }

    const newPhotos=await uploadPhotos(cerereId,$("c_photos")?.files);
    if(newPhotos.length){
      payload.photos=[...(currentPhotos||[]),...newPhotos];
    }

    await updateDoc(docRef,payload);

    location.href=`/cerere.html?id=${cerereId}`;
  }catch(e){
    console.error(e);
    setStatus("Eroare la salvare.");
  }finally{
    btnSave.disabled=false;
  }
});