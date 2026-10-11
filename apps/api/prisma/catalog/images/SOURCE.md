# Product photos

Apple's official product renders from the Apple Store
(`store.storeimages.cdn-apple.com`, the "finish-select" images of each model and colour),
downloaded on 2 Mehr 1405 (24 September 2026).

Processing (reproducible from the originals):

- **DEVICE** (`*-1.webp`, and `*-2.webp` for models with a back-and-side view):
  the whole phone. Apple's flat studio grey (#F5F5F7) is removed where present,
  the device is trimmed and centred on a transparent 1000 × 1250 canvas.
- **DETAIL** (the rest): close-ups as full-bleed 1000 × 1000 photos on Apple's
  studio grey, the straight crop edge sitting on the frame edge.

`manifest.json` lists every file with its colour, kind and size; `prisma/catalog/sync.ts`
reads it. The photos are Apple's; they depict the genuine products the store sells.
