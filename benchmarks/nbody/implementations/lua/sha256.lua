local ffi = require("ffi")

ffi.cdef[[
typedef unsigned long DWORD;
typedef int BOOL;
typedef void *PVOID;
typedef PVOID HCRYPTPROV;
typedef PVOID HCRYPTPROV_PTR;
typedef PVOID HCRYPTHASH;
typedef unsigned char BYTE;

BOOL CryptAcquireContextW(HCRYPTPROV_PTR *phProv, const wchar_t *pszContainer, const wchar_t *pszProvider, DWORD dwProvType, DWORD dwFlags);
BOOL CryptReleaseContext(HCRYPTPROV hProv, DWORD dwFlags);
BOOL CryptCreateHash(HCRYPTPROV hProv, DWORD Algid, HCRYPTPROV hKey, DWORD dwFlags, HCRYPTHASH *phHash);
BOOL CryptHashData(HCRYPTHASH hHash, const BYTE *pbData, DWORD dwDataLen, DWORD dwFlags);
BOOL CryptGetHashParam(HCRYPTHASH hHash, DWORD dwParam, BYTE *pbData, DWORD *pdwDataLen, DWORD dwFlags);
BOOL CryptDestroyHash(HCRYPTHASH hHash);

static const int PROV_RSA_AES = 24;
static const int CRYPT_VERIFYCONTEXT = 0xF0000000;
static const int HP_HASHVAL = 2;
static const int HP_HASHSIZE = 4;
static const int CALG_SHA_256 = 0x0000800c;
]]

local advapi32 = ffi.load("advapi32")

local PROV_RSA_AES = ffi.C.PROV_RSA_AES
local CRYPT_VERIFYCONTEXT = ffi.C.CRYPT_VERIFYCONTEXT
local HP_HASHVAL = ffi.C.HP_HASHVAL
local HP_HASHSIZE = ffi.C.HP_HASHSIZE
local CALG_SHA_256 = ffi.C.CALG_SHA_256

local function sha256(data)
    local prov = ffi.new("HCRYPTPROV_PTR[1]")
    if advapi32.CryptAcquireContextW(prov, nil, nil, PROV_RSA_AES, CRYPT_VERIFYCONTEXT) == 0 then
        error("CryptAcquireContext failed")
    end

    local hash = ffi.new("HCRYPTHASH[1]")
    if advapi32.CryptCreateHash(prov[0], CALG_SHA_256, nil, 0, hash) == 0 then
        advapi32.CryptReleaseContext(prov[0], 0)
        error("CryptCreateHash failed")
    end

    local buf = ffi.new("BYTE[?]", #data)
    ffi.copy(buf, data, #data)
    if advapi32.CryptHashData(hash[0], buf, #data, 0) == 0 then
        advapi32.CryptDestroyHash(hash[0])
        advapi32.CryptReleaseContext(prov[0], 0)
        error("CryptHashData failed")
    end

    local hashSize = ffi.new("DWORD[1]")
    local hashSizeLen = ffi.new("DWORD[1]", ffi.sizeof("DWORD"))
    if advapi32.CryptGetHashParam(hash[0], HP_HASHSIZE, ffi.cast("BYTE*", hashSize), hashSizeLen, 0) == 0 then
        advapi32.CryptDestroyHash(hash[0])
        advapi32.CryptReleaseContext(prov[0], 0)
        error("CryptGetHashParam HP_HASHSIZE failed")
    end

    local hashBuf = ffi.new("BYTE[?]", hashSize[0])
    local hashLen = ffi.new("DWORD[1]", hashSize[0])
    if advapi32.CryptGetHashParam(hash[0], HP_HASHVAL, hashBuf, hashLen, 0) == 0 then
        advapi32.CryptDestroyHash(hash[0])
        advapi32.CryptReleaseContext(prov[0], 0)
        error("CryptGetHashParam HP_HASHVAL failed")
    end

    local result = {}
    for i = 0, hashLen[0] - 1 do
        result[#result + 1] = string.format("%02x", hashBuf[i])
    end

    advapi32.CryptDestroyHash(hash[0])
    advapi32.CryptReleaseContext(prov[0], 0)

    return table.concat(result)
end

return sha256
