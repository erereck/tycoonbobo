# tycoonbobo 🌲

**Jogar agora:** https://erereck.github.io/tycoonbobo/

Protótipo de jogo web 3D: um **tycoon estilo Roblox** com **câmera e combate estilo League of Legends**.
Você começa como o Noob numa clareira da floresta e precisa virar o **#1 do planeta Terra**.

## Como rodar

```bash
npm install
npm run dev
```
Abra http://localhost:5199 . Para a versão otimizada: `npm run build` e depois `npm run preview`.

## Controles

Dois esquemas (troque em **Menu → Configurações → Controles**). As **setas andam nos dois**.

| Ação | WASD + mouse (padrão) | Clássico LoL |
|---|---|---|
| Andar | W A S D / setas · botão direito | botão direito (segure) · setas |
| Atacar | clique (esq. ou dir.) no inimigo | botão direito no inimigo · A + clique = ataque-movimento |
| Tijolo / Escudo / Avanço / Chuva de Tijolos | Q / F / E / R | Q / W / E / R |
| Poção / Flash / Voltar à base | C / Espaço / B | D / F / B |
| Parar | — | S |

Habilidades: segure a tecla para mirar e solte para lançar.

| Tecla | Ação |
|---|---|
| 1–4 | Trocar de arma |
| V | 1ª pessoa (só dentro da base): WASD/setas + mouse, Espaço pula, E/clique interage |
| Y | Travar/destravar câmera (no Clássico, Espaço centraliza) |
| Roda | Zoom |
| Esc / Tab / F3 | Menu / minimizar ranking / FPS |

Teclas de teste: **F9** = +$50K e +10 de cada item · **F10** = anoitecer (ataque à base). No site publicado, só funcionam com `?dev` no fim do endereço.

## O que tem no protótipo

- **Tycoon**: dropper manual de manivela → 7 droppers automáticos, 2 esteiras, 3 upgraders, 2 fornalhas, cofre + botão COLETAR, 29 compras com animação de "cair do céu".
- **Base que cresce**: cerca de madeira → prédio de tijolos com 1º andar → terraço com torres de flechas, muralha de pedra, reforma de mármore, troféu.
- **Transparência inteligente**: no térreo os andares de cima e a fachada ficam translúcidos (sem sombra e sem luzes vazando); no 1º andar, só o terraço some; recorte em volta do Noob quando árvores/paredes o cobrem.
- **Combate estilo LoL**: auto-ataque com wind-up, projéteis teleguiados, QWER com indicadores de mira, Flash, poções, Recall, níveis 1–18, críticos.
- **Floresta**: 7 acampamentos (gosmas que se dividem, lobos, goblins, golem de musgo, capitão goblin) com leash/reset e timers no minimapa, rio, pontes, pântano, ciclo dia/noite, vaga-lumes.
- **Ataques noturnos**: saqueadores seguem um flow-field até o cofre e roubam o dinheiro não coletado.
- **Chefe**: Rei Goblin em 3 fases (slam, giro, investida, chuva de pedras, guardas reais) atrás do portal — a última compra da área.
- **Missões guiadas**, ranking mundial (começa em #8,1 bilhões), leaderboard estilo Roblox, save automático + ganhos offline.

## Acabamento visual (v0.2)

- **Color grading cinematográfico**: sombras frias, luzes quentes, curva S, vibrance, grão sutil, vinheta; tratamento azulado de "noite americana" e aberração cromática ao levar dano. FXAA automático no modo Baixa.
- **Luz**: golden hour, pôr do sol e noite de lua retrabalhados; sombras suaves (PCF com raio); névoa que acompanha o zoom; lâmpadas que acendem de verdade à noite.
- **Oclusão ambiente assada**: copas e troncos escurecem na base, o chão e a grama ficam sombreados sob as árvores, rochas com musgo no topo — sem custo em tempo real.
- **Personagens**: rim light para destacar o Noob e os inimigos, contorno vermelho ao passar o mouse/mirar (estilo LoL), sombra de contato instanciada, anel de seleção e anel de alvo, rastro na lâmina da espada e no Avanço, recuo e "pop" ao acertar, poeira nos passos.
- **Chefe**: cinemática de entrada com letterbox e câmera em contra-plongée.
- **UI**: quadro de alvo estilo LoL, seta de objetivo na borda da tela com distância, confete nas missões e na vitória, moedas voando até o contador ao coletar, avisos de "você já pode comprar", tela de título em layout de coluna com o Noob acenando, dicas no carregamento.
- **Base viva**: faíscas nas fornalhas, água/brasas/brilho nos upgraders, sopro nos droppers, brilho nos botões compráveis.
- **Áudio ambiente procedural**: vento com rajadas, rio perto da água e fogueiras crepitando (continua sem música).

## Otimização

Terreno em chunks com frustum culling, ~4 mil árvores/rochas/flores em InstancedMesh por chunk, grama 100% na GPU (posições recicladas no shader), construções da base fundidas por material (static batching), peças dos inimigos fundidas por membro, IA dormindo longe do jogador, pool fixo de luzes (sem recompilar shaders), sombra que segue o jogador com snap de texel, resolução adaptativa automática, 4 presets de qualidade com benchmark de GPU na primeira execução, pré-compilação de todos os shaders no carregamento (sem travadas na primeira aparição do chefe/efeitos) e cache de alvos por frame. Tudo procedural: nenhuma textura, modelo ou áudio externo (efeitos sonoros sintetizados com WebAudio).
