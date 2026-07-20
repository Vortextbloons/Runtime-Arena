local json = {}

local null = {}
json.null = null

local function skip_whitespace(str, pos)
    while pos <= #str do
        local c = str:sub(pos, pos)
        if c == " " or c == "\t" or c == "\n" or c == "\r" then
            pos = pos + 1
        else
            break
        end
    end
    return pos
end

local function parse_string(str, pos)
    pos = pos + 1
    local result = {}
    while pos <= #str do
        local c = str:sub(pos, pos)
        if c == '"' then
            return table.concat(result), pos + 1
        elseif c == "\\" then
            pos = pos + 1
            local esc = str:sub(pos, pos)
            if esc == '"' then result[#result+1] = '"'
            elseif esc == "\\" then result[#result+1] = "\\"
            elseif esc == "/" then result[#result+1] = "/"
            elseif esc == "b" then result[#result+1] = "\b"
            elseif esc == "f" then result[#result+1] = "\f"
            elseif esc == "n" then result[#result+1] = "\n"
            elseif esc == "r" then result[#result+1] = "\r"
            elseif esc == "t" then result[#result+1] = "\t"
            elseif esc == "u" then
                local hex = str:sub(pos+1, pos+4)
                local code = tonumber(hex, 16)
                if code < 128 then
                    result[#result+1] = string.char(code)
                else
                    result[#result+1] = "?"
                end
                pos = pos + 4
            end
        else
            result[#result+1] = c
        end
        pos = pos + 1
    end
    error("unterminated string")
end

local function parse_number(str, pos)
    local start = pos
    if str:sub(pos, pos) == "-" then pos = pos + 1 end
    while pos <= #str and str:sub(pos, pos):match("[%d]") do pos = pos + 1 end
    if pos <= #str and str:sub(pos, pos) == "." then
        pos = pos + 1
        while pos <= #str and str:sub(pos, pos):match("[%d]") do pos = pos + 1 end
    end
    if pos <= #str and (str:sub(pos, pos) == "e" or str:sub(pos, pos) == "E") then
        pos = pos + 1
        if str:sub(pos, pos) == "+" or str:sub(pos, pos) == "-" then pos = pos + 1 end
        while pos <= #str and str:sub(pos, pos):match("[%d]") do pos = pos + 1 end
    end
    return tonumber(str:sub(start, pos-1)), pos
end

local parse_value

local function parse_array(str, pos)
    pos = pos + 1
    pos = skip_whitespace(str, pos)
    local arr = {}
    if str:sub(pos, pos) == "]" then return arr, pos + 1 end
    while true do
        local val
        val, pos = parse_value(str, pos)
        arr[#arr+1] = val
        pos = skip_whitespace(str, pos)
        if str:sub(pos, pos) == "]" then return arr, pos + 1 end
        pos = pos + 1
    end
end

local function parse_object(str, pos)
    pos = pos + 1
    pos = skip_whitespace(str, pos)
    local obj = {}
    if str:sub(pos, pos) == "}" then return obj, pos + 1 end
    while true do
        local key
        key, pos = parse_string(str, pos)
        pos = skip_whitespace(str, pos)
        pos = pos + 1
        local val
        val, pos = parse_value(str, pos)
        obj[key] = val
        pos = skip_whitespace(str, pos)
        if str:sub(pos, pos) == "}" then return obj, pos + 1 end
        pos = pos + 1
    end
end

parse_value = function(str, pos)
    pos = skip_whitespace(str, pos)
    local c = str:sub(pos, pos)
    if c == '"' then return parse_string(str, pos)
    elseif c == "{" then return parse_object(str, pos)
    elseif c == "[" then return parse_array(str, pos)
    elseif c == "t" then return true, pos + 4
    elseif c == "f" then return false, pos + 5
    elseif c == "n" then return null, pos + 4
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
    for i = 1, #s do
        local c = s:sub(i, i)
        if c == '"' then result[#result+1] = '\\"'
        elseif c == "\\" then result[#result+1] = "\\\\"
        elseif c == "\n" then result[#result+1] = "\\n"
        elseif c == "\r" then result[#result+1] = "\\r"
        elseif c == "\t" then result[#result+1] = "\\t"
        elseif c == "\b" then result[#result+1] = "\\b"
        elseif c == "\f" then result[#result+1] = "\\f"
        else result[#result+1] = c
        end
    end
    result[#result+1] = '"'
    return table.concat(result)
end

local encode_value

local function encode_array(arr)
    local parts = {}
    for i = 1, #arr do
        parts[i] = encode_value(arr[i])
    end
    return "[" .. table.concat(parts, ",") .. "]"
end

local function encode_object(obj)
    local parts = {}
    for k, v in pairs(obj) do
        parts[#parts+1] = encode_string(k) .. ":" .. encode_value(v)
    end
    return "{" .. table.concat(parts, ",") .. "}"
end

encode_value = function(val)
    if val == null then return "null"
    elseif type(val) == "boolean" then return val and "true" or "false"
    elseif type(val) == "number" then
        if val == math.floor(val) and math.abs(val) < 2^53 then
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
