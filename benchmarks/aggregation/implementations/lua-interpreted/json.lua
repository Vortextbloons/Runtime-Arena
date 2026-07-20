local json = {}
local byte = string.byte
local sub = string.sub
local char = string.char
local concat = table.concat
local floor = math.floor
local abs = math.abs

local null = {}
json.null = null

local BYTE_SPACE = 32
local BYTE_TAB = 9
local BYTE_LF = 10
local BYTE_CR = 13
local BYTE_QUOTE = 34
local BYTE_BACKSLASH = 92
local BYTE_OPEN_BRACE = 123
local BYTE_CLOSE_BRACE = 125
local BYTE_OPEN_BRACKET = 91
local BYTE_CLOSE_BRACKET = 93
local BYTE_COLON = 58
local BYTE_COMMA = 44
local BYTE_MINUS = 45
local BYTE_DOT = 46
local BYTE_e = 101
local BYTE_E = 69
local BYTE_PLUS = 43
local BYTE_t = 116
local BYTE_f = 102
local BYTE_n = 110
local BYTE_0 = 48
local BYTE_9 = 57

local function is_ws(c)
    return c == BYTE_SPACE or c == BYTE_TAB or c == BYTE_LF or c == BYTE_CR
end

local function is_digit(c)
    return c >= BYTE_0 and c <= BYTE_9
end

local function skip_whitespace(str, pos)
    local len = #str
    while pos <= len do
        local c = byte(str, pos)
        if not is_ws(c) then break end
        pos = pos + 1
    end
    return pos
end

local parse_value

local function parse_string(str, pos)
    pos = pos + 1
    local result = {}
    local len = #str
    while pos <= len do
        local c = byte(str, pos)
        if c == BYTE_QUOTE then
            return concat(result), pos + 1
        elseif c == BYTE_BACKSLASH then
            pos = pos + 1
            local esc = byte(str, pos)
            if esc == BYTE_QUOTE then result[#result+1] = '"'
            elseif esc == BYTE_BACKSLASH then result[#result+1] = "\\"
            elseif esc == 47 then result[#result+1] = "/"        -- /
            elseif esc == 98 then result[#result+1] = "\b"       -- b
            elseif esc == 102 then result[#result+1] = "\f"      -- f
            elseif esc == BYTE_LF then result[#result+1] = "\n"
            elseif esc == BYTE_CR then result[#result+1] = "\r"
            elseif esc == BYTE_t then result[#result+1] = "\t"
            elseif esc == BYTE_u then
                local h = sub(str, pos+1, pos+4)
                local code = tonumber(h, 16)
                if code and code < 128 then
                    result[#result+1] = char(code)
                else
                    result[#result+1] = "?"
                end
                pos = pos + 4
            end
        else
            result[#result+1] = char(c)
        end
        pos = pos + 1
    end
    error("unterminated string")
end

local function parse_number(str, pos)
    local start = pos
    local len = #str
    local c = byte(str, pos)
    if c == BYTE_MINUS then pos = pos + 1 end
    while pos <= len and is_digit(byte(str, pos)) do pos = pos + 1 end
    if pos <= len and byte(str, pos) == BYTE_DOT then
        pos = pos + 1
        while pos <= len and is_digit(byte(str, pos)) do pos = pos + 1 end
    end
    c = byte(str, pos)
    if pos <= len and (c == BYTE_e or c == BYTE_E) then
        pos = pos + 1
        c = byte(str, pos)
        if pos <= len and (c == BYTE_PLUS or c == BYTE_MINUS) then pos = pos + 1 end
        while pos <= len and is_digit(byte(str, pos)) do pos = pos + 1 end
    end
    return tonumber(sub(str, start, pos-1)), pos
end

local function parse_array(str, pos)
    pos = pos + 1
    pos = skip_whitespace(str, pos)
    local arr = {}
    if byte(str, pos) == BYTE_CLOSE_BRACKET then return arr, pos + 1 end
    while true do
        local val
        val, pos = parse_value(str, pos)
        arr[#arr+1] = val
        pos = skip_whitespace(str, pos)
        if byte(str, pos) == BYTE_CLOSE_BRACKET then return arr, pos + 1 end
        pos = pos + 1
    end
end

local function parse_object(str, pos)
    pos = pos + 1
    pos = skip_whitespace(str, pos)
    local obj = {}
    if byte(str, pos) == BYTE_CLOSE_BRACE then return obj, pos + 1 end
    while true do
        local key
        key, pos = parse_string(str, pos)
        pos = skip_whitespace(str, pos)
        pos = pos + 1
        local val
        val, pos = parse_value(str, pos)
        obj[key] = val
        pos = skip_whitespace(str, pos)
        if byte(str, pos) == BYTE_CLOSE_BRACE then return obj, pos + 1 end
        pos = pos + 1
    end
end

parse_value = function(str, pos)
    pos = skip_whitespace(str, pos)
    local c = byte(str, pos)
    if c == BYTE_QUOTE then return parse_string(str, pos)
    elseif c == BYTE_OPEN_BRACE then return parse_object(str, pos)
    elseif c == BYTE_OPEN_BRACKET then return parse_array(str, pos)
    elseif c == BYTE_t then return true, pos + 4
    elseif c == BYTE_f then return false, pos + 5
    elseif c == BYTE_n then return null, pos + 4
    else return parse_number(str, pos)
    end
end

function json.decode(str)
    local result, _ = parse_value(str, 1)
    return result
end

local function is_array(tbl)
    local count = 0
    for _ in pairs(tbl) do count = count + 1 end
    return count == #tbl
end

local function encode_string(s)
    local result = {'"'}
    local len = #s
    for i = 1, len do
        local c = byte(s, i)
        if c == BYTE_QUOTE then result[#result+1] = '\\"'
        elseif c == BYTE_BACKSLASH then result[#result+1] = "\\\\"
        elseif c == BYTE_LF then result[#result+1] = "\\n"
        elseif c == BYTE_CR then result[#result+1] = "\\r"
        elseif c == 9 then result[#result+1] = "\\t"
        elseif c == 8 then result[#result+1] = "\\b"
        elseif c == 12 then result[#result+1] = "\\f"
        else result[#result+1] = char(c)
        end
    end
    result[#result+1] = '"'
    return concat(result)
end

local encode_value

local function encode_array(arr)
    local parts = {}
    for i = 1, #arr do
        parts[i] = encode_value(arr[i])
    end
    return "[" .. concat(parts, ",") .. "]"
end

local function encode_object(obj)
    local parts = {}
    for k, v in pairs(obj) do
        parts[#parts+1] = encode_string(k) .. ":" .. encode_value(v)
    end
    return "{" .. concat(parts, ",") .. "}"
end

encode_value = function(val)
    if val == null then return "null"
    elseif type(val) == "boolean" then return val and "true" or "false"
    elseif type(val) == "number" then
        if val == floor(val) and abs(val) < 2^53 then
            return string.format("%d", val)
        else
            return string.format("%.17g", val)
        end
    elseif type(val) == "string" then return encode_string(val)
    elseif type(val) == "table" then
        if is_array(val) then return encode_array(val)
        else return encode_object(val)
        end
    end
    error("cannot encode " .. type(val))
end

function json.encode(val)
    return encode_value(val)
end

return json
