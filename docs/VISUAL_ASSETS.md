# Recursos visuais da aventura Letria

Ilustrações originais geradas em 16/09/2026 com a ferramenta integrada `image_gen` (modo padrão), a partir do padrão visual da referência fornecida pelo usuário: cores vivas, volumes 3D arredondados, paisagem de jogo infantil, trilha em ilha e personagens acolhedores. A referência serviu como orientação de estilo; não foi incorporada como captura de interface.

## Arquivos finais

Todos os arquivos estão em `apps/plataforma/public/art/` dentro deste projeto; o aplicativo não depende da pasta de geração do Codex.

| Arquivo | Dimensões reais | Transparência | Uso |
| --- | --- | --- | --- |
| `trail-island.png` | 1024 × 1536 | Não | Fundo da trilha com botões interativos renderizados em HTML |
| `lumi-explorer.png` | 1254 × 1254 | Alpha real, canto alfa 0 | Personagem Lumi |
| `hero-adventure.png` | 1536 × 1024 | Não | Boas-vindas com área livre para texto à esquerda |
| `og-playful.png` | 1730 × 909 | Não | Imagem social; proporção aproximada 1200:630 |

## Verificação

As quatro imagens foram inspecionadas visualmente: composição, estilo infantil, cores, personagens, ausência de interface e textos indesejados. A imagem social apresenta corretamente “Letria” e “Uma aventura em cada palavra”. Dimensões, formato de pixels e alfa foram verificados por leitura com System.Drawing. As imagens foram copiadas sem conversão nem edição, preservando o alfa original da Lumi.

A ilha tem clareiras úteis para quatro etapas em posições aproximadas (x%, y% a partir do canto superior esquerdo): (55, 73), (34, 56), (62, 37), (48, 12). Os controles devem continuar HTML acessível; a ilustração não contém números nem botões.

## Prompts finais

### trail-island.png

```text
Use case: stylized-concept. Asset type: portrait 2:3 learning game map background, 1024x1536. Create original high-quality polished playful clay toy 3D game landscape for a children's literacy adventure. Bright cyan blue sky in top15%; one lush bright green floating island fills frame, tilted overhead isometric perspective, rounded pine trees and tiny white daisies along margins, turquoise water and small waterfalls flowing down rocky island edges, small orange tiled roof cottage near upper right, golden treasure chest at lower right edge. Main feature a wide continuous sandy golden S winding walking path from lower foreground up to cottage. Path passes these image coordinates measured from TOP LEFT: x55% y84%, x35% y62%, x63% y40%, x49% y19%; leave broad clean sandy clearings around each coordinate for later HTML game buttons. Keep path unobstructed. Terrain visible all around path. Sunny warm soft shadows, saturated emerald grass, soft golden highlights, rounded handmade toy volumes, dimensional and charming. Entire image is illustration edge to edge, no device frame. NO numbers, NO circles or game markers, NO UI, NO buttons, NO stars arranged as rewards, NO text, NO banner, NO lettering, NO characters, NO watermark. Polished joyful mobile adventure-game aesthetic, not photorealistic.
```

### lumi-explorer.png

```text
Use case: stylized-concept. Asset type: transparent game mascot cutout, square1024x1024. Create an original adorable fullbody lavender owl explorer named Lumi, with large rounded head, big expressive dark brown glossy eyes, pale lavender face disk, soft violet feather tufts, tiny golden beak, plump rounded lilac body, small backpack visible at sides, golden yellow scarf tied around neck, short orange feet. One wing raised in a welcoming wave, other near body. Facing viewer threequarter slight turn left. Polished dimensional clay-toy 3D illustration for children's literacy game. Joyful kind reassuring expression. Soft bright studio sunlight, clean rounded smooth volumes with subtle feather sculpting, pastel purple and warm golden palette, premium playful mobilegame mascot. Isolated centered fullbody with comfortable10% margin allaround, allfeet andwingtip visible. Must have genuine transparent alpha background, no painted checkerboard, no white background, no shadowbox, no stage, no text, no lettering, no watermarks.
```

### hero-adventure.png

```text
Use case: stylized-concept. Asset type: landscape3:2 app hero illustration 1536x1024. An original polished playful claytoy 3D children's literacy adventure illustration. Cyan blue sky with a few pillowy white clouds near upper right, rounded brightgreen grassy foreground at bottom15%, tiny daisies and distant round hills near right. RIGHT45% of composition contains a friendly young explorer child, brown wavy hair, warm tan skin, large cheerful expressive eyes, yellow hoodie and blue backpack, waving, accompanied by a little lavender owl with pale lavender face, large darkbrown eyes, yellow scarf and orange feet. Child is shown from knees up and owl standing on grassy mound beside child. LEFT55% must remain open completely clean brightblue sky, consistent cyan tones, enough negative space for HTML greeting and buttons. Colorful sunny lighting, smooth rounded sculpted toy material, soft shadows, dimensional illustrated mobile adventure game aesthetic, welcoming and joyous. NO text, no lettering, no UI, no numbers, no buttons, no borders, no device mockup, no watermark.
```

### og-playful.png

```text
Use case: ads-marketing. Asset type: OpenGraph share card, horizontal1200x630, children literacy game Letria. Create original polished playful3D claytoy adventure illustration with typography. Bright cyan sky, soft pillowy clouds, bottomquarter lush rounded green grassy floating island with small daisies, gentle sunny daylight. RIGHT45% friendly young explorer child brownwavy hair, yellowhoodie bluebackpack, smiling and waving, beside small adorable lavender owl with large darkbrown eyes, yellow scarf and orangefeet. LEFT55% features large meticulously legible wordmark text exactly "Letria" in chunky playful rounded white lettering with soft violet thick extruded depth, below in dark navy friendly rounded typography exact Portuguese text "Uma aventura em cada palavra" split across two lines with spacious clear legible layout. This exact text only, correct accents and spelling. Overall vividcyan, golden yellow, lavender purple, leafgreen palette, dimensional warm welcoming mobilegame style. Full edge-to-edge artwork. No deviceframes, no UI buttons, no watermarks, no other text.
```
