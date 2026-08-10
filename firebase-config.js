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

// Conta técnica só pra autenticar o app no Firebase (não é um login de
// verdade — quem controla o acesso ao APLICATIVO é a tela de login
// usuário/senha, essa conta aqui é só o "crachá" que libera o Firestore).
// Precisa criar ela manualmente uma vez no Firebase, veja o README.
const FIREBASE_AUTH_EMAIL = 'texugo@ponto.local';
const FIREBASE_AUTH_PASSWORD = 'Krisium150';

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
    firebase.auth().signInWithEmailAndPassword(FIREBASE_AUTH_EMAIL, FIREBASE_AUTH_PASSWORD)
      .then(() => startFirestoreSync())
      .catch(err => {
        console.warn('Não consegui autenticar no Firebase — confira se criou a conta técnica (veja o README). Usando só armazenamento local por enquanto.', err.message);
      });
  }catch(e){
    console.warn('Firebase indisponível, usando só armazenamento local.', e);
  }
}

function startFirestoreSync(){
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
