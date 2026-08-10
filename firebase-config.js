// ==========================================================
// PONTO — configuração do Firebase
// ==========================================================
// Troque os valores abaixo pelos do SEU projeto Firebase.
// Console → Configurações do projeto → Seus apps → app Web (</>)
//
// Enquanto os valores estiverem como "COLE_AQUI", o app funciona
// normalmente, só que sem sincronizar com a nuvem — fica só no
// armazenamento local do aparelho (do jeito que já funcionava antes).
// ==========================================================

const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};

// Nome do documento no Firestore onde tudo fica salvo.
// Não precisa mexer nisso.
const FIREBASE_COLLECTION = 'ponto';
const FIREBASE_DOC = 'dados';

// ---------- não mexer daqui pra baixo ----------
let fbDocRef = null;
let fbReady = false;
let fbSaveTimer = null;
let fbApplyingRemote = false;

function firebaseConfigured(){
  return firebaseConfig.apiKey && firebaseConfig.apiKey !== 'COLE_AQUI';
}

function initFirebaseSync(){
  if(!firebaseConfigured()){
    console.log('Firebase não configurado ainda — usando só armazenamento local.');
    return;
  }
  if(typeof firebase === 'undefined'){
    console.warn('SDK do Firebase não carregou (sem internet?) — usando só armazenamento local.');
    return;
  }
  try{
    firebase.initializeApp(firebaseConfig);
    fbDocRef = firebase.firestore().collection(FIREBASE_COLLECTION).doc(FIREBASE_DOC);
    fbReady = true;

    // puxa o que já existe na nuvem assim que abre o app
    fbDocRef.get().then(snap=>{
      if(snap.exists && snap.data().payload){
        fbApplyingRemote = true;
        db = JSON.parse(snap.data().payload);
        localStorage.setItem(STORAGE_KEY, snap.data().payload);
        if(typeof refreshActiveView === 'function') refreshActiveView();
        fbApplyingRemote = false;
      } else {
        // nuvem ainda vazia — manda o que já tem localmente pra lá
        pushToCloud(true);
      }
    }).catch(err=>{
      console.warn('Não consegui buscar dados da nuvem agora:', err.message);
    });

    // fica ouvindo mudanças feitas em outro aparelho, em tempo real
    fbDocRef.onSnapshot(snap=>{
      if(!snap.exists) return;
      if(snap.metadata.hasPendingWrites) return; // é a nossa própria escrita, ignora
      const data = snap.data();
      if(!data || !data.payload) return;
      fbApplyingRemote = true;
      db = JSON.parse(data.payload);
      localStorage.setItem(STORAGE_KEY, data.payload);
      if(typeof refreshActiveView === 'function') refreshActiveView();
      fbApplyingRemote = false;
    });
  }catch(e){
    console.warn('Firebase indisponível, usando só armazenamento local.', e);
  }
}

function pushToCloud(immediate){
  if(!fbReady || fbApplyingRemote) return;
  clearTimeout(fbSaveTimer);
  const send = () => {
    fbDocRef.set({
      payload: JSON.stringify(db),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err=>console.warn('Não consegui salvar na nuvem agora:', err.message));
  };
  if(immediate) send();
  else fbSaveTimer = setTimeout(send, 700); // agrupa mudanças rápidas numa escrita só
}
