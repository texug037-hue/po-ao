# Ponto — Vendas & Estoque

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
app.v2.js              <- toda a lógica do app — este é o arquivo que muda a cada atualização
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
Toda vez que eu mandar uma atualização:
1. Vai vir um arquivo novo, tipo `app.v2.js` (nunca reaproveita o nome antigo).
2. Substitui o `app.v2.js` antigo pelo novo `app.v2.js` no repositório.
3. No `index.html`, troca a linha final:
   ```html
   <script src="app.v2.js"></script>
   ```
   por:
   ```html
   <script src="app.v2.js"></script>
   ```
4. No `sw.js`, troca o número da versão do cache:
   ```js
   const CACHE_NAME = 'ponto-cache-v2';
   ```
   por:
   ```js
   const CACHE_NAME = 'ponto-cache-v2';
   ```
   (isso força o app a baixar os arquivos novos em vez de usar os antigos guardados no celular)
5. Sobe os arquivos alterados pro GitHub. Da próxima vez que abrir o app, ele atualiza sozinho.

Os dados (marcas, vendas, clientes) **não se perdem** nesse processo — ficam guardados no navegador, independente da versão do código.
