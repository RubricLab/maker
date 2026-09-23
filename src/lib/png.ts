import { deflateSync } from 'node:zlib'

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const TARGET_SIZE = 480

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
	let crc = n
	for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
	return crc
})

const crc32 = (bytes: Uint8Array): number => {
	let crc = 0xffffffff
	for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

const chunk = (type: string, data: Uint8Array): Uint8Array => {
	const bytes = new Uint8Array(12 + data.length)
	const view = new DataView(bytes.buffer)
	view.setUint32(0, data.length)
	bytes.set(new TextEncoder().encode(type), 4)
	bytes.set(data, 8)
	view.setUint32(8 + data.length, crc32(bytes.subarray(4, 8 + data.length)))
	return bytes
}

/** Renders a grid of 0/1 characters as a black-on-white 8-bit grayscale PNG with a one-cell margin. */
export const renderGridPng = (grid: string): Uint8Array => {
	const size = Math.sqrt(grid.length)
	const scale = Math.max(8, Math.floor(TARGET_SIZE / (size + 2)))
	const width = (size + 2) * scale
	const scanlines = new Uint8Array((width + 1) * width)
	for (let y = 0; y < width; y++) {
		const offset = y * (width + 1)
		scanlines[offset] = 0 // Filter type: none.
		const row = Math.floor(y / scale) - 1
		for (let x = 0; x < width; x++) {
			const column = Math.floor(x / scale) - 1
			const inside = row >= 0 && row < size && column >= 0 && column < size
			scanlines[offset + 1 + x] = inside && grid[row * size + column] === '1' ? 0 : 255
		}
	}
	const header = new Uint8Array(13)
	const view = new DataView(header.buffer)
	view.setUint32(0, width)
	view.setUint32(4, width)
	header.set([8, 0, 0, 0, 0], 8) // 8-bit grayscale, deflate, adaptive filtering, no interlace.
	return Buffer.concat([
		PNG_SIGNATURE,
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(scanlines)),
		chunk('IEND', new Uint8Array())
	])
}
