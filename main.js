import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
    import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
    import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, onSnapshot, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
    
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

    // Firebase Config (***이 부분이 수정되었습니다***)
    const firebaseConfig = {
      apiKey: "AIzaSyCiwzde40jsz17CEz-rrMmmBrn-S6brdlE",
      authDomain: "comicschedule-dfec7.firebaseapp.com",
      projectId: "comicschedule-dfec7",
      storageBucket: "comicschedule-dfec7.firebasestorage.app", // <-- 올바른 주소
      messagingSenderId: "1004611276816", // <-- 사용자님이 주신 새 ID
      appId: "1:1004611276816:web:aca83237bafa971ed1fa95", // <-- 사용자님이 주신 새 ID
      measurementId: "G-ZNZZQRJZF9"
    };

    // ***이 부분이 수정되었습니다 (analytics 관련 코드 제거, 원본 코드로 복구)***
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app); 

    const signInBtn=document.getElementById('signInBtn');
    const signOutBtn=document.getElementById('signOutBtn');
    const userInfoEl=document.getElementById('userInfo');
    const loadingOverlay=document.getElementById('loading-overlay');
    const provider = new GoogleAuthProvider();
    
    // **도메인 추출 함수를 모듈 스코프에서 사용 가능하도록 재정의**
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
        imagesCol: collection(db, `${userPath}/images`), // 이미지/동영상/링크 북마크 통합 컬렉션
      };
    };

    window.ensureLogin=()=>{
      if(!window.isAuthReady){ document.getElementById('modal-message').textContent='데이터 로딩 중입니다.'; document.getElementById('alert-modal').classList.remove('hidden'); return false; }
      if(!auth.currentUser){ document.getElementById('modal-message').textContent='로그인 후 이용해 주세요.'; document.getElementById('alert-modal').classList.remove('hidden'); return false; }
      return true;
    };

    let notesTimer=null;
    window.cloudSaveNotesDebounced=function(){ clearTimeout(notesTimer); notesTimer=setTimeout(()=>window.cloudSaveNotes&&window.cloudSaveNotes(),800); };

    window.cloudSaveAll=async ()=>{
      if(!ensureLogin()) return;
      const { tasksCol, stateDoc } = await cloudRefs();
      window.taskStatus=window.taskStatus||{}; window.customTasks=window.customTasks||[];
      await setDoc(stateDoc,{taskStatus:window.taskStatus},{merge:true});
      // FireStore에서 setDoc은 문서 ID가 없으면 생성, 있으면 덮어쓰기/병합하므로 map/reduce 대신 setDoc 사용
      const ops=window.customTasks.map(t=>setDoc(doc(tasksCol,String(t.id)),t,{merge:true}));
      await Promise.all(ops);
    };

    window.cloudSaveStateOnly=async ()=>{
      if(!ensureLogin()) return;
      const { stateDoc } = await cloudRefs();
      window.taskStatus=window.taskStatus||{};
      await setDoc(stateDoc,{taskStatus:window.taskStatus},{merge:true});
    };

    window.cloudSaveNotes=async ()=>{
      if(!ensureLogin()) return;
      const { stateDoc } = await cloudRefs();
      const st=await getDoc(stateDoc);
      const prev=st.exists()?(st.data()||{}):{};
      const notesTabs=prev.notesTabs||{};
      const activeId = window.__notesActiveTabId || prev.notesActiveTabId || 'memo';
      const notesAreaEl=document.getElementById('notesArea');
      if(notesAreaEl){ notesTabs[activeId]=notesAreaEl.value ?? ''; }
      await setDoc(stateDoc,{notesTabs, notesActiveTabId: activeId},{merge:true});
    };

    // 메모 탭 CRUD (stateDoc 내부 notesTabList / notesTabs 사용)
    window.cloudSetActiveNotesTab = async (tabId)=>{
      if(!ensureLogin()) return;
      const { stateDoc } = await cloudRefs();
      await setDoc(stateDoc,{ notesActiveTabId: tabId },{ merge:true });
    };

    window.cloudAddNotesTab = async ({id, name})=>{
      if(!ensureLogin()) return;
      const { stateDoc } = await cloudRefs();
      const st=await getDoc(stateDoc);
      const prev=st.exists()?(st.data()||{}):{};
      const list = Array.isArray(prev.notesTabList) ? prev.notesTabList : [];
      const maxOrder = list.reduce((m,t)=>Math.max(m, Number(t.order||0)), 0);
      const next = [...list, { id, name, order: maxOrder + 10 }];
      await setDoc(stateDoc,{ notesTabList: next, notesActiveTabId: id },{ merge:true });
    };

    window.cloudRenameNotesTab = async (tabId, newName)=>{
      if(!ensureLogin()) return;
      const { stateDoc } = await cloudRefs();
      const st=await getDoc(stateDoc);
      const prev=st.exists()?(st.data()||{}):{};
      const list = Array.isArray(prev.notesTabList) ? prev.notesTabList : [];
      const next = list.map(t=> t.id===tabId ? ({...t, name:newName}) : t);
      await setDoc(stateDoc,{ notesTabList: next },{ merge:true });
    };

    window.cloudReorderNotesTabs = async (orderedList)=>{
      if(!ensureLogin()) return;
      const { stateDoc } = await cloudRefs();
      // orderedList는 [{id,name,order},...] 형태
      await setDoc(stateDoc,{ notesTabList: orderedList },{ merge:true });
    };

    window.cloudDeleteNotesTab = async (tabId)=>{
      if(!ensureLogin()) return;
      const { stateDoc } = await cloudRefs();
      const st=await getDoc(stateDoc);
      const prev=st.exists()?(st.data()||{}):{};
      const list = Array.isArray(prev.notesTabList) ? prev.notesTabList : [];
      const notesTabs = prev.notesTabs || {};
      const nextList = list.filter(t=>t.id!==tabId);
      const nextNotes = {...notesTabs};
      delete nextNotes[tabId];

      // 최소 1개 탭 유지 (없어지면 기본 '메모' 생성)
      let nextActive = prev.notesActiveTabId || window.__notesActiveTabId || 'memo';
      if(nextActive===tabId){
        nextActive = nextList[0]?.id || 'memo';
      }
      if(nextList.length===0){
        nextList.push({ id:'memo', name:'메모', order:0 });
        nextActive = 'memo';
        // 기본 탭은 빈 메모
        nextNotes['memo'] = nextNotes['memo'] || '';
      }

      await setDoc(stateDoc,{ notesTabList: nextList, notesTabs: nextNotes, notesActiveTabId: nextActive },{ merge:true });
    };

    window.deleteTask=async ()=>{
      if(!ensureLogin() || !window.currentTask?.id){ if(typeof closeModal==='function') closeModal(); return; }
      const { tasksCol } = await cloudRefs();
      await deleteDoc(doc(tasksCol,String(window.currentTask.id)));
      window.customTasks=(window.customTasks||[]).filter(t=>t.id!==window.currentTask.id);
      if(typeof renderCalendar==='function') renderCalendar();
    };

    // ===== 북마크 저장 로직 (sourceDomain 추가) =====
    
    // 동영상 북마크 저장 (URL만 저장, type: 'video')
    window.addVideoBookmark = async (url)=>{
      if(!ensureLogin()) return;
      const { imagesCol } = await cloudRefs();
      // pageUrl 필드에 동영상 URL을 저장. title 필드 추가.
      await addDoc(imagesCol,{ pageUrl: url, url: null, type:'video', title: null, sourceDomain: extractDomain(url), timestamp:new Date() }); 
    };
    
    // 일반 링크 북마크 저장 (URL만 저장, type: 'link')
    window.addGenericBookmark = async (url)=>{
      if(!ensureLogin()) return;
      const { imagesCol } = await cloudRefs();
      // pageUrl 필드에 일반 URL을 저장. title 필드 추가.
      await addDoc(imagesCol,{ pageUrl: url, url: null, type:'link', title: null, sourceDomain: extractDomain(url), timestamp:new Date() }); 
    };
    
    // 인스타그램 북마크 저장 (퍼가기 코드 저장, type: 'instagram')
    window.addInstagramBookmark = async (embedCode)=>{
      if(!ensureLogin()) return;
      const { imagesCol } = await cloudRefs();
      
      // 퍼가기 코드에서 원본 URL 추출 시도
      let pageUrl = '인스타그램 게시물';
      const parser = new DOMParser();
      const doc = parser.parseFromString(embedCode, 'text/html');
      const blockquote = doc.querySelector('blockquote.instagram-media');
      if(blockquote && blockquote.cite) pageUrl = blockquote.cite;
      
      await addDoc(imagesCol,{ pageUrl: pageUrl, embedCode: embedCode, url: null, type:'instagram', title: null, sourceDomain: extractDomain(pageUrl), timestamp:new Date() }); 
    };

    // 이미지 URL만 저장 (type: 'remote')
    window.addRemoteImage = async (url, pageUrl)=>{
      if(!ensureLogin()) return;
      const { imagesCol } = await cloudRefs();
      await addDoc(imagesCol,{ url, pageUrl: pageUrl||null, type:'remote', sourceDomain: extractDomain(pageUrl || url), timestamp:new Date() });
    };
    
    // [수정 4] window.addImage 함수 전체 교체 (ImgBB -> Firebase Storage)
    // (붙여넣기/클립보드/파일드래그 이미지 전용)
    window.addImage = async (file, pageUrl)=>{ // 'fileOrUrl'을 'file'로 명시
      if(!ensureLogin()) return;

      // file이 string으로 들어오는 경우 (현재 UI에서는 사용되지 않음)
      if (typeof file === 'string') {
          // 원본 URL 추가 로직으로 연결
          return window.addRemoteImage(file, pageUrl || file);
      }
      
      // file이 File 객체인 경우 (주요 사용 사례)
      try{
        const { imagesCol } = await cloudRefs();
        const user = auth.currentUser;
        if (!user) throw new Error("로그인이 필요합니다.");

        // 1. 고유한 파일 경로 생성
        const storagePath = `users/${user.uid}/uploads/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, storagePath);

        // 2. 파일 업로드 (피드백 메시지 추가)
        showFeedbackMessage('이미지 업로드 중...');
        const uploadResult = await uploadBytes(storageRef, file);
        
        // 3. 다운로드 URL 가져오기
        const downloadURL = await getDownloadURL(uploadResult.ref);
        
        const source = pageUrl ? extractDomain(pageUrl) : 'Uploaded (Firebase)';

        // 4. Firestore에 정보 저장
        await addDoc(imagesCol,{ 
          url: downloadURL,       // Firebase Storage URL
          pageUrl: pageUrl || null,
          type: 'firebase_storage', // ImgBB 대신 새 타입 지정
          storagePath: storagePath, // [중요] 삭제를 위한 파일 경로 저장
          title: null, 
          sourceDomain: source, 
          timestamp: new Date() 
        });
        showFeedbackMessage('이미지가 업로드되었습니다.'); // 성공 피드백

      }catch(err){
        console.error("Firebase Storage 업로드 실패:", err);
        document.getElementById('modal-message').textContent='이미지 추가 실패: '+(err.message||'오류');
        document.getElementById('alert-modal').classList.remove('hidden');
      }
    };

    // 북마크 제목 수정 기능 (신규)
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


    
    // ===== 링크 북마크 미리보기 이미지 업로드 (Firebase Storage) =====
    window.uploadBookmarkPreviewImage = async (bookmarkId, file)=>{
      if(!ensureLogin()) return;
      try{
        const { imagesCol } = await cloudRefs();
        const user = auth.currentUser;
        if(!user) throw new Error('로그인이 필요합니다.');
        if(!bookmarkId) throw new Error('북마크 ID가 없습니다.');
        if(!(file instanceof File)) throw new Error('이미지 파일이 아닙니다.');

        const safeName = (file.name && String(file.name).trim()) ? file.name : `preview_${Date.now()}.png`;
        const storagePath = `users/${user.uid}/uploads/bookmark_preview_${bookmarkId}_${Date.now()}_${safeName}`;
        const storageRef = ref(storage, storagePath);

        showFeedbackMessage('미리보기 이미지 업로드 중...');
        const uploadResult = await uploadBytes(storageRef, file, { contentType: file.type || 'image/png' });
        const downloadURL = await getDownloadURL(uploadResult.ref);

        const docRef = doc(imagesCol, bookmarkId);
        await updateDoc(docRef, {
          previewImageUrl: downloadURL,
          previewStoragePath: storagePath,
          previewUpdatedAt: new Date()
        });

        showFeedbackMessage('미리보기가 업데이트되었습니다.');
      }catch(err){
        console.error("미리보기 업로드 실패:", err);
        throw err;
      }
    };

// [수정 5] window.deleteImage 함수 전체 교체 (Firebase Storage 삭제 로직 추가)
    window.deleteImage = async (id)=>{
      if(!ensureLogin()) return;
      try{
        const { imagesCol } = await cloudRefs();
        const row=(window.imageBookmarks||[]).find(d=>d.id===id); 
        
        if(!row) throw new Error('북마크 항목을 찾을 수 없습니다.');
        
        // 1. Firebase Storage에 업로드된 파일인 경우
        if (row.type === 'firebase_storage') {
          // 1-1. Storage에서 파일 삭제
          if (row.storagePath) {
            try {
              const fileRef = ref(storage, row.storagePath);
              await deleteObject(fileRef);
            } catch (e) {
              console.warn("Storage 파일 삭제 실패 (무시함):", e);
              // 스토리지에 파일이 없더라도 DB 문서는 삭제되도록 계속 진행
            }
          }
          // 1-2. Firestore 문서 삭제
          await deleteDoc(doc(imagesCol, id));
          showFeedbackMessage('북마크가 삭제되었습니다.');

        // 2. ImgBB에 업로드된 파일인 경우 (기존 코드 유지)
        } else if(row.type==='imgbb'){
          const delUrl=row.imgbb_delete_url||null;
          if(delUrl){ 
            try{ 
                await fetch(delUrl,{method:'GET'}); 
            }catch(_){/* imgbb 삭제 오류는 무시 */} 
          }
          await deleteDoc(doc(imagesCol,id));
          showFeedbackMessage('북마크가 삭제되었습니다.');
        
        // 3. 단순 링크/URL 북마크인 경우 (DB 문서만 삭제)
        } else if(row.type==='remote' || row.type === 'video' || row.type === 'link' || row.type === 'instagram'){
          await deleteDoc(doc(imagesCol,id));
          showFeedbackMessage('북마크가 삭제되었습니다.');
        
        // 4. 기타 (DB 문서만 삭제)
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

      // ===== 메모 탭 스키마 초기화 (기존 메모/탭을 정리하고 '메모' 탭 1개로 시작) =====
      try{
        const st=await getDoc(stateDoc);
        const prev=st.exists()?(st.data()||{}):{};
        const ver = Number(prev.notesSchemaVersion || 0);
        if(ver < 2){
          // 기존 메모 정리(요청사항: 깔끔하게 초기화)
          const defaultTabs=[{ id:'memo', name:'메모', order:0 }];
          await setDoc(stateDoc,{
            notesSchemaVersion: 2,
            notesTabList: defaultTabs,
            notesTabs: { memo: '' },
            notesActiveTabId: 'memo'
          },{ merge:true });
        }
      }catch(_){}

      window.__unsubs.forEach(fn=>{ try{ fn(); }catch(_){} }); window.__unsubs=[];

      const unsubTasks = onSnapshot(tasksCol,(snap)=>{ window.customTasks=snap.docs.map(d=>({id:d.id,...d.data()})); if(typeof renderCalendar==='function') renderCalendar(); });
      window.__unsubs.push(unsubTasks);

      const unsubState = onSnapshot(stateDoc,(ds)=>{
        const data=ds.exists()?(ds.data()||{}):{};
        window.taskStatus=data.taskStatus||{};
        window.__notesTabList = Array.isArray(data.notesTabList) && data.notesTabList.length ? data.notesTabList : [{ id:'memo', name:'메모', order:0 }];
        window.__notesTabs = data.notesTabs || {};
        window.__notesActiveTabId = data.notesActiveTabId || window.__notesActiveTabId || 'memo';
        if(typeof window.renderNotesUI==='function') window.renderNotesUI();
        if(typeof renderCalendar==='function') renderCalendar();
      });
      window.__unsubs.push(unsubState);

      const unsubImages = onSnapshot(imagesCol,(snap)=>{ 
          // imageBookmarks에 이미지/동영상/링크/인스타그램 북마크 모두 포함
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
        window.customTasks=[]; window.taskStatus={}; window.imageBookmarks=[]; window.__notesTabs={}; window.__notesTabList=[{id:'memo',name:'메모',order:0}]; window.__notesActiveTabId='memo';
        if(typeof renderCalendar==='function') renderCalendar(); if(typeof renderImageBookmarks==='function') renderImageBookmarks(); const na=document.getElementById('notesArea'); if(na) na.value='';
      }
      loadingOverlay.classList.add('hidden'); window.isAuthReady=true;
    });

initCalendar();
initNotes();
initBookmarks();
