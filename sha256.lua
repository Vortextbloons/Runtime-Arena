local bit = require("bit")
local band = bit.band
local bor = bit.bor
local bxor = bit.bxor
local lshift = bit.lshift
local rshift = bit.rshift
local byte = string.byte
local char = string.char
local fmt = string.format
local rep = string.rep

local K = {
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
}

local function sha256(message)
	local h0, h1, h2, h3 = 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a
	local h4, h5, h6, h7 = 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19

	local msg_len = #message
	local bit_len = msg_len * 8
	local pad_len = 64 - ((msg_len + 9) % 64)
	if pad_len == 64 then pad_len = 0 end
	local total_len = msg_len + 1 + pad_len + 8

	local data = message .. "\128" .. rep("\0", pad_len) ..
		char(0, 0, 0, 0) ..
		char(band(rshift(bit_len, 24), 0xff), band(rshift(bit_len, 16), 0xff), band(rshift(bit_len, 8), 0xff), band(bit_len, 0xff))

	local w = {}

	for chunk = 1, total_len, 64 do
		local a, b, c, d, e, f, g, h = h0, h1, h2, h3, h4, h5, h6, h7

		local base = chunk
		w[0]  = bor(lshift(byte(data, base), 24), lshift(byte(data, base+1), 16), lshift(byte(data, base+2), 8), byte(data, base+3))
		w[1]  = bor(lshift(byte(data, base+4), 24), lshift(byte(data, base+5), 16), lshift(byte(data, base+6), 8), byte(data, base+7))
		w[2]  = bor(lshift(byte(data, base+8), 24), lshift(byte(data, base+9), 16), lshift(byte(data, base+10), 8), byte(data, base+11))
		w[3]  = bor(lshift(byte(data, base+12), 24), lshift(byte(data, base+13), 16), lshift(byte(data, base+14), 8), byte(data, base+15))
		w[4]  = bor(lshift(byte(data, base+16), 24), lshift(byte(data, base+17), 16), lshift(byte(data, base+18), 8), byte(data, base+19))
		w[5]  = bor(lshift(byte(data, base+20), 24), lshift(byte(data, base+21), 16), lshift(byte(data, base+22), 8), byte(data, base+23))
		w[6]  = bor(lshift(byte(data, base+24), 24), lshift(byte(data, base+25), 16), lshift(byte(data, base+26), 8), byte(data, base+27))
		w[7]  = bor(lshift(byte(data, base+28), 24), lshift(byte(data, base+29), 16), lshift(byte(data, base+30), 8), byte(data, base+31))
		w[8]  = bor(lshift(byte(data, base+32), 24), lshift(byte(data, base+33), 16), lshift(byte(data, base+34), 8), byte(data, base+35))
		w[9]  = bor(lshift(byte(data, base+36), 24), lshift(byte(data, base+37), 16), lshift(byte(data, base+38), 8), byte(data, base+39))
		w[10] = bor(lshift(byte(data, base+40), 24), lshift(byte(data, base+41), 16), lshift(byte(data, base+42), 8), byte(data, base+43))
		w[11] = bor(lshift(byte(data, base+44), 24), lshift(byte(data, base+45), 16), lshift(byte(data, base+46), 8), byte(data, base+47))
		w[12] = bor(lshift(byte(data, base+48), 24), lshift(byte(data, base+49), 16), lshift(byte(data, base+50), 8), byte(data, base+51))
		w[13] = bor(lshift(byte(data, base+52), 24), lshift(byte(data, base+53), 16), lshift(byte(data, base+54), 8), byte(data, base+55))
		w[14] = bor(lshift(byte(data, base+56), 24), lshift(byte(data, base+57), 16), lshift(byte(data, base+58), 8), byte(data, base+59))
		w[15] = bor(lshift(byte(data, base+60), 24), lshift(byte(data, base+61), 16), lshift(byte(data, base+62), 8), byte(data, base+63))

		for i = 16, 63 do
			local x = w[i - 15]
			local s0 = bxor(bxor(rshift(x, 7), lshift(x, 25)), bxor(rshift(x, 18), lshift(x, 14)), rshift(x, 3))
			local y = w[i - 2]
			local s1 = bxor(bxor(rshift(y, 17), lshift(y, 15)), bxor(rshift(y, 19), lshift(y, 13)), rshift(y, 10))
			w[i] = band(w[i - 16] + s0 + w[i - 7] + s1, 0xffffffff)
		end

		for i = 0, 63 do
			local S1 = bxor(bxor(rshift(e, 6), lshift(e, 26)), bxor(rshift(e, 11), lshift(e, 21)), rshift(e, 25))
			local ch = bxor(band(e, f), band(bxor(e, 0xffffffff), g))
			local temp1 = band(h + S1 + ch + K[i + 1] + w[i], 0xffffffff)
			local S0 = bxor(bxor(rshift(a, 2), lshift(a, 30)), bxor(rshift(a, 13), lshift(a, 19)), rshift(a, 22))
			local maj = bxor(bxor(band(a, b), band(a, c)), band(b, c))
			local temp2 = band(S0 + maj, 0xffffffff)
			h = g
			g = f
			f = e
			e = band(d + temp1, 0xffffffff)
			d = c
			c = b
			b = a
			a = band(temp1 + temp2, 0xffffffff)
		end

		h0 = band(h0 + a, 0xffffffff)
		h1 = band(h1 + b, 0xffffffff)
		h2 = band(h2 + c, 0xffffffff)
		h3 = band(h3 + d, 0xffffffff)
		h4 = band(h4 + e, 0xffffffff)
		h5 = band(h5 + f, 0xffffffff)
		h6 = band(h6 + g, 0xffffffff)
		h7 = band(h7 + h, 0xffffffff)
	end

	return fmt("%08x%08x%08x%08x%08x%08x%08x%08x",
		h0, h1, h2, h3, h4, h5, h6, h7)
end

return sha256
