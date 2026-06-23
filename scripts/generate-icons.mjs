import sharp from 'sharp'

async function generateIcon(size, outputPath) {
  const bg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#0a1628"/>
    </svg>`
  )

  const logoSize = Math.round(size * 0.65)
  const offset   = Math.round((size - logoSize) / 2)

  const logo = await sharp('public/walz-logo.png')
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  await sharp(bg)
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(outputPath)

  console.log(`✓ ${outputPath} (${size}x${size})`)
}

await generateIcon(192,  'public/icons/walz-staff-192.png')
await generateIcon(512,  'public/icons/walz-staff-512.png')
await generateIcon(1024, 'public/icons/walz-staff-1024.png')
console.log('All icons generated.')
