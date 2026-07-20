local function rrotate(x, n)
	n = n % 32
	return ((x >> n) | (x << (32 - n))) & 0xffffffff
end

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

local function bytes_to_uint32_be(data, offset)
	local b1, b2, b3, b4 = string.byte(data, offset, offset + 3)
	return ((b1 << 24) | (b2 << 16) | (b3 << 8) | b4) & 0xffffffff
end

local function uint32_to_bytes_be(value)
	return string.char(
		(value >> 24) & 0xff,
		(value >> 16) & 0xff,
		(value >> 8) & 0xff,
		value & 0xff
	)
end

local function preprocess(message)
	local bit_len = #message * 8
	local padding = 64 - ((#message + 9) % 64)
	if padding == 64 then padding = 0 end
	return message .. "\128" .. string.rep("\0", padding) .. uint32_to_bytes_be(0) .. uint32_to_bytes_be(bit_len)
end

local function sha256(message)
	local h0, h1, h2, h3 = 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a
	local h4, h5, h6, h7 = 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	local data = preprocess(message)

	for chunk = 1, #data, 64 do
		local w = {}
		for i = 0, 15 do
			w[i] = bytes_to_uint32_be(data, chunk + i * 4)
		end
		for i = 16, 63 do
			local s0 = rrotate(w[i - 15], 7) ~ rrotate(w[i - 15], 18) ~ (w[i - 15] >> 3)
			local s1 = rrotate(w[i - 2], 17) ~ rrotate(w[i - 2], 19) ~ (w[i - 2] >> 10)
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & 0xffffffff
		end

		local a, b, c, d, e, f, g, h = h0, h1, h2, h3, h4, h5, h6, h7
		for i = 0, 63 do
			local S1 = rrotate(e, 6) ~ rrotate(e, 11) ~ rrotate(e, 25)
			local ch = (e & f) ~ ((~e) & g)
			local temp1 = (h + S1 + ch + K[i + 1] + w[i]) & 0xffffffff
			local S0 = rrotate(a, 2) ~ rrotate(a, 13) ~ rrotate(a, 22)
			local maj = (a & b) ~ (a & c) ~ (b & c)
			local temp2 = (S0 + maj) & 0xffffffff
			h = g
			g = f
			f = e
			e = (d + temp1) & 0xffffffff
			d = c
			c = b
			b = a
			a = (temp1 + temp2) & 0xffffffff
		end

		h0 = (h0 + a) & 0xffffffff
		h1 = (h1 + b) & 0xffffffff
		h2 = (h2 + c) & 0xffffffff
		h3 = (h3 + d) & 0xffffffff
		h4 = (h4 + e) & 0xffffffff
		h5 = (h5 + f) & 0xffffffff
		h6 = (h6 + g) & 0xffffffff
		h7 = (h7 + h) & 0xffffffff
	end

	return string.format(
		"%08x%08x%08x%08x%08x%08x%08x%08x",
		h0, h1, h2, h3, h4, h5, h6, h7
	)
end

return sha256
