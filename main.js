import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
    import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
    import { getFirestore, doc, setDoc, deleteDoc, collection, onSnapshot, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
    
    // [수정 2] Firebase Storage 모듈 임포트
    import { 
      getStorage, 
      ref, 
      uploadBytes, 
      getDownloadURL, 
      deleteObject 
    } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

import { initCalendar } from "./calendar.js";
import { initNotes } from "./notes.js";
import { initBookmarks } from "./bookmarks.js";

    // Firebase Config
    const firebaseConfig = {
      apiKey: "AIzaSyCiwzde40jsz17CEz-rrMmmBrn-S6brdlE",
      authDomain: "comicschedule-dfec7.firebaseapp.com",
      projectId: "comicschedule-dfec7",
      storageBucket: "comicschedule-dfec7.firebasestorage.app",
      messagingSenderId: "1004611276816",
      appId: "1:1004611276816:web:aca83237bafa971ed1fa95",
      measurementId: "G-ZNZZQRJZF9"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app); 

    const signInBtn=document.getElementById('signInBtn');
    const signOutBtn=document.getElementById('signOutBtn');
    const userInfoEl=document.getElementById('userInfo');
    const loadingOverlay=document.getElementById('loading-overlay');
    const provider = new GoogleAuthProvider();
    
    function extractDomain(url) {
        if (!url) return 'Unknown';
        try {
            const urlObj = new URL(url.includes('://') ? url : 'https://' + url);
            let domain = urlObj.hostname;
            if (domain.startsWith('www.')) domain = domain.substring(4);
            return domain;
        } catch {
            return 'Unknown';
        }
    }

    async function doSignIn(){
      try{ await signInWithPopup(auth,provider); }
      catch(e){
        if(e.code==='auth/popup-blocked'||e.code==='auth/unauthorized-domain'){ await signInWithRedirect(auth,provider); }
        else{ document.getElementById('modal-message').textContent='로그인 오류: '+(e.message||e.code); document.getElementById('alert-modal').classList.remove('hidden'); }
      }
    }
    getRedirectResult(auth).catch(()=>{});

    signInBtn.onclick=()=>doSignIn();
    signOutBtn.onclick=()=>signOut(auth);

    window.cloudRefs=async ()=>{
      const uid=auth.currentUser.uid;
      const userPath=`users/${uid}`;
      return {
        tasksCol: collection(db, `${userPath}/customTasks`),
        stateDoc: doc(db, `${userPath}/meta/appState`),
        imagesCol: collection(db, `${userPath}/images`),
      };
    };

    window.ensureLogin=()=>{
      if(!window.isAuthReady){ document.getElementById('modal-message').textContent='데이터 로딩 중입니다.'; document.getElementById('alert-modal').classList.remove('hidden'); return false; }
      if(!auth.currentUser){ document.getElementById('modal-message').textContent='로그인 후 이용해 주세요.'; document.getElementById('alert-modal').classList.remove('hidden'); return false; }
      return true;
    };

    let notesTimer=null;
    window.cloudSaveNotesDebounced=function(){ clearTimeout(notesTimer); notesTimer=setTimeout(()=>window.cloudSaveNotesModel&&window.cloudSaveNotesModel(),800); };

    window.cloudSaveAll=async ()=>{
      if(!ensureLogin()) return;
      const { tasksCol, stateDoc } = await cloudRefs();
      window.taskStatus=window.taskStatus||{}; window.customTasks=window.customTasks||[];
      await setDoc(stateDoc,{taskStatus:window.taskStatus},{merge:true});
      const ops=window.customTasks.map(t=>setDoc(doc(tasksCol,String(t.id)),t,{merge:true}));
      await Promise.all(ops);
    };

    window.cloudSaveStateOnly=async ()=>{
      if(!ensureLogin()) return;
      const { stateDoc } = await cloudRefs();
      window.taskStatus=window.taskStatus||{};
      await setDoc(stateDoc,{taskStatus:window.taskStatus},{merge:true});
    };

window.cloudSaveNotesModel=async ()=>{
      if(!ensureLogin()) return;
      const { stateDoc } = await cloudRefs();

      // UI에서 최신 textarea 내용을 모델에 먼저 반영
      try{
        const ta=document.getElementById('notesArea');
        if(ta && window.notesActiveTabId){
          window.notesById = window.notesById || {};
          window.notesById[window.notesActiveTabId] = ta.value ?? '';
        }
      }catch(_){}

      // 안전 보정
      const notesTabList = Array.isArray(window.notesTabList) ? window.notesTabList : [];
      const notesById = (window.notesById && typeof window.notesById==='object') ? window.notesById : {};
      const notesActiveTabId = window.notesActiveTabId || (notesTabList[0]?.id ?? null);

      await setDoc(stateDoc,{ notesTabList, notesById, notesActiveTabId },{merge:true});
    };

    // 하위 호환: 기존 호출 이름 유지
    window.cloudSaveNotes = window.cloudSaveNotesModel;

    window.deleteTask=async ()=>{
      if(!ensureLogin() || !window.currentTask?.id){ if(typeof closeModal==='function') closeModal(); return; }
      const { tasksCol } = await cloudRefs();
      await deleteDoc(doc(tasksCol,String(window.currentTask.id)));
      window.customTasks=(window.customTasks||[]).filter(t=>t.id!==window.currentTask.id);
      if(typeof renderCalendar==='function') renderCalendar();
    };

    // ===== 북마크 저장 로직 =====
    window.addVideoBookmark = async (url)=>{
      if(!ensureLogin()) return;
      const { imagesCol } = await cloudRefs();
      await addDoc(imagesCol,{ pageUrl: url, url: null, type:'video', title: null, sourceDomain: extractDomain(url), timestamp:new Date() }); 
    };
    window.addGenericBookmark = async (url)=>{
      if(!ensureLogin()) return;
      const { imagesCol } = await cloudRefs();
      await addDoc(imagesCol,{ pageUrl: url, url: null, type:'link', title: null, sourceDomain: extractDomain(url), timestamp:new Date() }); 
    };
    window.addInstagramBookmark = async (embedCode)=>{
      if(!ensureLogin()) return;
      const { imagesCol } = await cloudRefs();
      let pageUrl = '인스타그램 게시물';
      const parser = new DOMParser();
      const doc2 = parser.parseFromString(embedCode, 'text/html');
      const blockquote = doc2.querySelector('blockquote.instagram-media');
      if(blockquote && blockquote.cite) pageUrl = blockquote.cite;
      await addDoc(imagesCol,{ pageUrl: pageUrl, embedCode: embedCode, url: null, type:'instagram', title: null, sourceDomain: extractDomain(pageUrl), timestamp:new Date() }); 
    };
    window.addRemoteImage = async (url, pageUrl)=>{
      if(!ensureLogin()) return;
      const { imagesCol } = await cloudRefs();
      await addDoc(imagesCol,{ url, pageUrl: pageUrl||null, type:'remote', sourceDomain: extractDomain(pageUrl || url), timestamp:new Date() });
    };

    window.addImage = async (file, pageUrl)=>{
      if(!ensureLogin()) return;
      if (typeof file === 'string') {
          return window.addRemoteImage(file, pageUrl || file);
      }
      try{
        const { imagesCol } = await cloudRefs();
        const user = auth.currentUser;
        if (!user) throw new Error("로그인이 필요합니다.");

        const storagePath = `users/${user.uid}/uploads/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, storagePath);

        showFeedbackMessage('이미지 업로드 중...');
        const uploadResult = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(uploadResult.ref);
        const source = pageUrl ? extractDomain(pageUrl) : 'Uploaded (Firebase)';

        await addDoc(imagesCol,{ 
          url: downloadURL,
          pageUrl: pageUrl || null,
          type: 'firebase_storage',
          storagePath: storagePath,
          title: null, 
          sourceDomain: source, 
          timestamp: new Date() 
        });
        showFeedbackMessage('이미지가 업로드되었습니다.');
      }catch(err){
        console.error("Firebase Storage 업로드 실패:", err);
        document.getElementById('modal-message').textContent='이미지 추가 실패: '+(err.message||'오류');
        document.getElementById('alert-modal').classList.remove('hidden');
      }
    };

    window.updateBookmarkTitle = async (id, newTitle) => {
        if (!ensureLogin()) return;
        const { imagesCol } = await cloudRefs();
        const docRef = doc(imagesCol, id);
        try {
            await updateDoc(docRef, { title: newTitle || null });
        } catch (e) {
            console.error("제목 업데이트 오류:", e);
            showAlert("제목을 저장하는 중 오류가 발생했습니다.");
        }
    };

    window.deleteImage = async (id)=>{
      if(!ensureLogin()) return;
      try{
        const { imagesCol } = await cloudRefs();
        const row=(window.imageBookmarks||[]).find(d=>d.id===id); 
        if(!row) throw new Error('북마크 항목을 찾을 수 없습니다.');

        if (row.type === 'firebase_storage') {
          if (row.storagePath) {
            try {
              const fileRef = ref(storage, row.storagePath);
              await deleteObject(fileRef);
            } catch (e) {
              console.warn("Storage 파일 삭제 실패 (무시함):", e);
            }
          }
          await deleteDoc(doc(imagesCol, id));
          showFeedbackMessage('북마크가 삭제되었습니다.');
        } else if(row.type==='imgbb'){
          const delUrl=row.imgbb_delete_url||null;
          if(delUrl){ 
            try{ await fetch(delUrl,{method:'GET'}); }catch(_){}
          }
          await deleteDoc(doc(imagesCol,id));
          showFeedbackMessage('북마크가 삭제되었습니다.');
        } else {
          await deleteDoc(doc(imagesCol, id));
          showFeedbackMessage('북마크가 삭제되었습니다.');
        }
      }catch(e){
        document.getElementById('modal-message').textContent='북마크 삭제 중 오류: '+(e?.message||'unknown');
        document.getElementById('alert-modal').classList.remove('hidden');
      }
    };

    // ===== 실시간 동기화 =====
    window.__unsubs=[];
    async function setupRealtimeSync(){
      const { tasksCol, stateDoc, imagesCol } = await cloudRefs();
      window.__unsubs.forEach(fn=>{ try{ fn(); }catch(_){} }); window.__unsubs=[];

      const unsubTasks = onSnapshot(tasksCol,(snap)=>{ 
        window.customTasks=snap.docs.map(d=>({id:d.id,...d.data()})); 
        if(typeof renderCalendar==='function') renderCalendar(); 
      });
      window.__unsubs.push(unsubTasks);

const unsubState = onSnapshot(stateDoc,(ds)=>{ 
        const data=ds.exists()?(ds.data()||{}):{}; 
        window.taskStatus=data.taskStatus||{}; 

        // ===== Notes: 새 구조 =====
        let tabList = Array.isArray(data.notesTabList) ? data.notesTabList : null;
        let byId = (data.notesById && typeof data.notesById==='object') ? data.notesById : null;
        let activeId = data.notesActiveTabId || null;

        // 레거시(notesTabs) 마이그레이션(1회)
        if(!tabList || !byId){
          const legacy = (data.notesTabs && typeof data.notesTabs==='object') ? data.notesTabs : null;
          if(legacy){
            const names = Object.keys(legacy);
            tabList = names.map((name, i)=>({ id:`legacy_${i}_${Date.now()}`, name }));
            byId = {};
            tabList.forEach((t)=>{ byId[t.id] = legacy[t.name] ?? ''; });
            activeId = tabList[0]?.id || null;

            if(auth.currentUser){
              setDoc(stateDoc,{ notesTabList: tabList, notesById: byId, notesActiveTabId: activeId },{merge:true}).catch(()=>{});
            }
          }
        }

        window.notesTabList = tabList || window.notesTabList || [];
        window.notesById = byId || window.notesById || {};
        window.notesActiveTabId = activeId || window.notesActiveTabId || (window.notesTabList[0]?.id ?? null);

        if(typeof window.renderNotesUI === 'function'){ 
          window.renderNotesUI(); 
        }

        if(typeof renderCalendar==='function') renderCalendar(); 
      });
      window.__unsubs.push(unsubState);

      const unsubImages = onSnapshot(imagesCol,(snap)=>{ 
          window.imageBookmarks=snap.docs.map(d=>({id:d.id,...d.data()})); 
          if(typeof renderImageBookmarks==='function') renderImageBookmarks(); 
      });
      window.__unsubs.push(unsubImages);
    }

    onAuthStateChanged(auth, async (user)=>{
      loadingOverlay.classList.remove('hidden'); window.isAuthReady=false;
      if(user){
        userInfoEl.textContent = `${user.displayName || '로그인됨'} (${user.email || ''})`;
        signInBtn.classList.add('hidden');
        signOutBtn.classList.remove('hidden');
        await setupRealtimeSync();
      }else{
        userInfoEl.textContent=''; signOutBtn.classList.add('hidden'); signInBtn.classList.remove('hidden');
        window.__unsubs.forEach(fn=>{ try{ fn(); }catch(_){} }); window.__unsubs=[];
        window.customTasks=[]; window.taskStatus={}; window.imageBookmarks=[]; window.notesTabList=[]; window.notesById={}; window.notesActiveTabId=null;
        if(typeof renderCalendar==='function') renderCalendar(); 
        if(typeof renderImageBookmarks==='function') renderImageBookmarks(); 
        if(typeof window.renderNotesUI==='function') window.renderNotesUI();
        const na=document.getElementById('notesArea'); if(na) na.value='';
      }
      loadingOverlay.classList.add('hidden'); window.isAuthReady=true;
    });

initCalendar();
initNotes();
initBookmarks();
