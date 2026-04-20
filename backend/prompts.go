package main

import _ "embed"

//go:embed prompts/user_info.md
var userInfoPrompt string

const tryonBasePrompt = `Virtual try-on. Generate a single photorealistic image of the described
person wearing the described garment. First input is the garment and the second
one is the user

Core rules:
- The person's face, skin tone, hairstyle, body shape, and identity must
  match the source image exactly. Do not alter, idealize, slim, or
  reshape any part of the body.
- The garment must match the provided garment image exactly — same color,
  pattern, texture, print, logos, stitching, and construction details.
- Maintain the person's original pose and body orientation from their
  source image.
- Background: clean, plain, neutral-toned studio backdrop.
- Lighting: soft, even, diffused studio lighting with no harsh shadows.
- Camera: straight-on, eye-level, centered framing showing full torso
  at minimum.
- No mannequin artifacts, floating fabric, or disembodied limbs.
- No watermarks, text overlays, or split-image compositions.`
