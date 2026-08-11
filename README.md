# Ponto — Vendas & Estoque

**Volume 8** — login redesenhado (usuário/senha com rótulos claros, olho pra mostrar senha, "Manter sessão salva" bem visível — sem marcar, sempre pede login de novo) e ganhou botão "Sair do sistema" no painel de backup, pra forçar limpar a sessão quando quiser. Pedidos aguardando pagamento agora têm botão de Desconto (em R$) que atualiza o valor a pagar na hora. Lista de itens em Marcas não mostra mais o custo — só estoque; custo continua visível ao editar.

**Volume 7** — tirou a % de imposto/margem: agora você digita o custo E o valor final direto, sem cálculo automático. Login ganhou entrada por digital (opcional). Firebase agora usa autenticação de verdade (regras fechadas), não mais acesso aberto.

**Volume 5** — corrigido o modal de backup que estava cortando na tela (estava preso dentro do cabeçalho); login agora pede senha toda vez que fecha o app, a não ser que marque "Manter conectado".

**Volume 4** — cliente agora é cadastro fixo (não some mais se você apagar a venda dele); aba Vendas mostra as pagas também, até você limpar em Itens; comprovante aceita PDF e imagem da galeria, sem forçar câmera.

**Volume 3** — itens dentro de cada marca agora aparecem em ordem alfabética, sempre.

**Volume 2** — tirou o campo de % solto na lista (agora edita só pelo menu de toque longo); editar/excluir agora vale pra cliente e pedido também, igual marca e item.

**Volume 1** — primeira versão finalizada como PWA (instalável na tela inicial).

## Login
- Usuário: `texugo`
- Senha: `Krisium`

Fica salvo no navegador depois do primeiro login — não pede de novo, a não ser que limpe os dados do site.

## Backup
Botão 💾 no canto do cabeçalho, em qualquer tela:
- **Baixar backup (.json)** — salva uma cópia de tudo (marcas, itens, pedidos, histórico).
- **Restaurar backup** — sobrescreve os dados atuais pelos de um arquivo `.json` baixado antes.

Como os dados ficam só no navegador do aparelho (localStorage), é bom baixar um backup de vez em quando — principalmente antes de limpar cache do navegador ou trocar de celular.

**Volume 6** — Firebase já embutido no código, pronto pra sincronizar online. Só falta você criar o projeto e colar as credenciais em `firebase-config.js`.

## Ligar o armazenamento online (Firebase)
O app já vem preparado — enquanto você não mexer em nada, ele continua funcionando só com o armazenamento local (do jeito que já estava). Pra ligar a nuvem, com segurança de verdade (ninguém de fora consegue ler ou mexer nos seus dados sem a chave certa):

1. Cria o projeto no [console.firebase.google.com](https://console.firebase.google.com) (veja o passo a passo completo mais abaixo).
2. Abre o arquivo **`firebase-config.js`** (é o único que você precisa editar).
3. Troca os valores `"COLE_AQUI"` pelos do seu projeto (o Firebase te dá esse bloco pronto, é só copiar e colar).
4. Sobe o `firebase-config.js` editado no GitHub. **Não precisa mexer em mais nada** — nem trocar versão, nem editar outro arquivo.
5. Abre o app — ele detecta sozinho que a configuração foi preenchida e começa a sincronizar.

A partir daí, os dados ficam salvos tanto no aparelho (localStorage, pra funcionar mesmo sem internet) quanto na nuvem (Firestore) — se você abrir o app em outro celular com a mesma configuração, os dados aparecem lá também, sincronizados.

### Passo a passo pra criar o projeto Firebase
1. Vai em **console.firebase.google.com**, loga com sua conta Google.
2. **Criar projeto** → dá um nome, ex: `ponto-vendas` → pode desmarcar Google Analytics → Criar.
3. Menu lateral → **Compilação → Firestore Database** → Criar banco de dados → modo produção → escolhe a região.
4. Aba **Regras** do Firestore, troca por isto (fecha o acesso pra quem não tiver autenticado — é a parte da segurança):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
5. Menu lateral → **Compilação → Authentication** → Começar → na aba "Sign-in method", ativa **Email/senha**.
6. Ainda em Authentication, aba **Users** → **Add user** → cadastra:
   - E-mail: `texugo@ponto.local`
   - Senha: `Krisium150`

   *(Isso não é o login que você usa pra abrir o app — aquele continua sendo `texugo` / `Krisium` na tela normal. Essa conta aqui é só o "crachá" que o app mostra pro Firebase por trás dos panos, pra provar que tem permissão de ler/escrever os dados. Se quiser trocar esse e-mail/senha técnica, edita `FIREBASE_AUTH_EMAIL` e `FIREBASE_AUTH_PASSWORD` no `firebase-config.js` e cadastra a mesma combinação aqui no passo 6.)*
7. Ícone de engrenagem → **Configurações do projeto** → desce até "Seus apps" → clica no ícone **`</>`** (Web) → registra um app (nome qualquer) → não precisa do Firebase Hosting.
8. Ele mostra um bloco `firebaseConfig = { apiKey: "...", ... }` — copia os valores de dentro pro `firebase-config.js`.

## Entrada por digital (opcional)
No primeiro login com usuário e senha, se o aparelho tiver leitor de digital/Face ID, aparece uma opção **"Ativar entrada por digital neste aparelho"**. Marcando ela, das próximas vezes aparece um botão **"🔒 Entrar com digital"** na tela de login — usa a digital do aparelho em vez de digitar a senha de novo. Isso é por aparelho: se usar em outro celular, precisa ativar de novo lá.

Isso é diferente do "Manter conectado" — a digital ainda pede confirmação toda vez que abre o app (mais rápido que digitar, mas ainda exige você ali); o "Manter conectado" pula a tela de login inteira.

## Editar e excluir (toque longo)
Você é administrador — pode editar ou excluir qualquer marca ou item.
- **Segura o dedo apertado** em cima de uma marca ou de um item dentro dela.
- Abre um menu com **Editar** e **Excluir**.
- Excluir uma marca também apaga os itens dela (avisa antes, com confirmação).
- Excluir um item não mexe em vendas já registradas — elas guardam o preço de quando foram feitas.

## Estrutura de arquivos
Todos os arquivos ficam soltos, sem pasta — sobe tudo direto na raiz do repositório:
```
index.html            <- estrutura fixa (tela, login, backup) — muda pouco entre versões
app.v5.js               <- toda a lógica do app — este é o arquivo que muda a cada atualização
firebase-config.js      <- suas credenciais do Firebase — só você edita esse, eu não mexo nele
manifest.json          <- nome, ícone e cor do app instalado
sw.js                  <- cache do PWA (offline + atualização sem tela branca)
icon-192.png            <- ícone (Android)
icon-512.png            <- ícone (Android, tela cheia)
icon-maskable-512.png   <- ícone adaptável (Android)
apple-touch-icon.png    <- ícone (iPhone)
favicon-32.png          <- ícone da aba do navegador
```

## Como publicar no GitHub Pages
1. Cria um repositório novo (ex: `ponto-app`).
2. Sobe todos esses arquivos soltos na raiz do repositório (sem colocar em pasta nenhuma).
3. Vai em **Settings → Pages**, escolhe a branch `main` e pasta `/root`.
4. O link fica `https://SEU_USUARIO.github.io/ponto-app/`.
5. Abre esse link no celular → menu do navegador → **Adicionar à tela inicial**.

## Como atualizar sem dar conflito (padrão igual o Canaleta)
Toda vez que eu mandar uma atualização, o arquivo de lógica muda de nome (ex: de `app.v5.js` pra `app.v6.js` — nunca reaproveita o nome antigo). Exemplo de como aplicar:
1. Sobe o arquivo novo (`app.v6.js`) no repositório — pode deixar o antigo lá também, sem problema, ele só não é mais referenciado.
2. No `index.html`, troca a linha final:
   ```html
   <script src="app.v5.js"></script>
   ```
   por:
   ```html
   <script src="app.v6.js"></script>
   ```
3. No `sw.js`, troca o número da versão do cache:
   ```js
   const CACHE_NAME = 'ponto-cache-v5';
   ```
   por:
   ```js
   const CACHE_NAME = 'ponto-cache-v6';
   ```
   (isso força o app a baixar os arquivos novos em vez de usar os antigos guardados no celular)
4. Sobe os arquivos alterados pro GitHub. Da próxima vez que abrir o app, ele atualiza sozinho.

O `firebase-config.js` é diferente dos demais — pode editar e subir ele sozinho a qualquer momento (pra colar as credenciais, por exemplo) sem precisar trocar nome de versão nem mexer no `sw.js`. Ele sempre busca a versão mais nova direto.

Os dados (marcas, vendas, clientes) **não se perdem** nesse processo — ficam guardados no navegador, independente da versão do código.
