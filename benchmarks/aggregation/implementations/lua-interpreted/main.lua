local script_dir = arg[0]:match("(.*[/\\])") or "./"
local huge = math.huge
local min = math.min
local floor = math.floor
local abs = math.abs
local sort = table.sort
local concat = table.concat
local format = string.format
local open = io.open
package.path = script_dir .. "?.lua;" .. package.path

local sha256 = require("sha256")
local PROTOCOL_VERSION = "2.0.0"

-- Same number encoding the bundled json encoder used: integers as %d,
-- anything else (e.g. inf on empty input) as %.17g instead of erroring.
local function num(v)
    if v == floor(v) and abs(v) < 2^53 then return format("%d", v) end
    return format("%.17g", v)
end

local function arg_value(name)
    for i = 1, #arg do
        if arg[i] == name then return arg[i + 1] end
    end
end

local input_file = arg_value("--input")
local output_file = arg_value("--output")
local protocol_version = arg_value("--protocol-version")
if protocol_version ~= PROTOCOL_VERSION then
    io.stderr:write("unsupported protocol version " .. tostring(protocol_version) .. "\n")
    os.exit(1)
end
if not input_file or not output_file then
    io.stderr:write("Usage: lua main.lua --input <input-file> --output <output-file> --protocol-version 2.0.0\n")
    os.exit(1)
end

-- Plain scanner for the two harness fields: the generic JSON decoder costs
-- more per iteration than the checksum hash on these small messages.
local function proto_str(line, field)
    local key = '"' .. field .. '":'
    local s = line:find(key, 1, true)
    if not s then return nil end
    s = s + #key
    while line:sub(s, s) == " " do s = s + 1 end
    if line:sub(s, s) == '"' then
        local e = line:find('"', s + 1, true)
        if not e then return nil end
        return line:sub(s + 1, e - 1)
    end
    local e = s
    while e <= #line do
        local c = line:sub(e, e)
        if c == "," or c == "}" or c == " " then break end
        e = e + 1
    end
    return line:sub(s, e - 1)
end

local function respond_raw(s)
    io.write(s, "\n")
    io.flush()
end

local f = open(input_file, "r")
local content = f:read("*a")
f:close()

local rows = {}
local first_line = true
for line in content:gmatch("[^\r\n]+") do
    if first_line then first_line = false else
        local c1, c2, c3, c4 = line:find(",", 1, true)
        if c1 then
            local d2 = line:find(",", c1 + 1, true)
            local d3 = line:find(",", d2 + 1, true)
            local d4 = line:find(",", d3 + 1, true)
            if d2 and d3 and d4 then
                rows[#rows+1] = {
                    line:sub(c1 + 1, d2 - 1),
                    line:sub(d2 + 1, d3 - 1),
                    tonumber(line:sub(d3 + 1, d4 - 1)),
                    tonumber(line:sub(d4 + 1))
                }
            end
        end
    end
end
content = nil

local function kernel()
local record_count = 0
local total_quantity = 0
local total_value_minor_units = 0
local minimum_transaction = huge
local maximum_transaction = 0

local categories = {}
local accounts = {}

local row_count = #rows
for ri = 1, row_count do
            local fields = rows[ri]
            local account_id = fields[1]
            local category = fields[2]
            local quantity = fields[3]
            local unit_price = fields[4]
            local value = quantity * unit_price

            record_count = record_count + 1
            total_quantity = total_quantity + quantity
            total_value_minor_units = total_value_minor_units + value
            if value < minimum_transaction then minimum_transaction = value end
            if value > maximum_transaction then maximum_transaction = value end

            local cat = categories[category]
            if not cat then
                cat = {quantity = 0, valueMinorUnits = 0}
                categories[category] = cat
            end
            cat.quantity = cat.quantity + quantity
            cat.valueMinorUnits = cat.valueMinorUnits + value

            local acc = accounts[account_id]
            if not acc then
                accounts[account_id] = value
            else
                accounts[account_id] = acc + value
            end
end

local sorted_categories = {}
local sc_n = 0
for cat, data in pairs(categories) do
    sc_n = sc_n + 1
    sorted_categories[sc_n] = {
        category = cat,
        quantity = data.quantity,
        valueMinorUnits = data.valueMinorUnits
    }
end
sort(sorted_categories, function(a, b) return a.category < b.category end)

local sorted_accounts = {}
local sa_n = 0
for acc_id, value in pairs(accounts) do
    sa_n = sa_n + 1
    sorted_accounts[sa_n] = {accountId = acc_id, valueMinorUnits = value}
end
sort(sorted_accounts, function(a, b)
    if a.valueMinorUnits ~= b.valueMinorUnits then
        return a.valueMinorUnits > b.valueMinorUnits
    end
    return a.accountId < b.accountId
end)

local top_n = min(10, sa_n)

-- Shared entry encoding, built once with plain concatenation: string.format
-- parses its pattern on every call, which dominates at this entry count.
local cats_json = {}
for ci = 1, sc_n do
    local cat = sorted_categories[ci]
    cats_json[ci] = '{"category":"' .. cat.category .. '","quantity":' .. num(cat.quantity)
        .. ',"valueMinorUnits":' .. num(cat.valueMinorUnits) .. '}'
end

local accs_json = {}
for ai = 1, top_n do
    local acc = sorted_accounts[ai]
    accs_json[ai] = '{"accountId":"' .. acc.accountId .. '","valueMinorUnits":' .. num(acc.valueMinorUnits) .. '}'
end

local checksum_input = '{"Categories":[' .. concat(cats_json, ",") ..
    '],"TopAccounts":[' .. concat(accs_json, ",") .. ']}\n'

local checksum = sha256(checksum_input)

-- Final output reuses the same entry strings: no generic table encoder in
-- the hot path, and the digest covers the exact bytes written to disk.
local output = '{"benchmark":"aggregation","version":1,"recordCount":' .. num(record_count)
    .. ',"totalQuantity":' .. num(total_quantity)
    .. ',"totalValueMinorUnits":' .. num(total_value_minor_units)
    .. ',"categories":[' .. concat(cats_json, ",")
    .. '],"topAccounts":[' .. concat(accs_json, ",")
    .. '],"minimumTransactionMinorUnits":' .. num(minimum_transaction)
    .. ',"maximumTransactionMinorUnits":' .. num(maximum_transaction)
    .. ',"checksum":"' .. checksum .. '"}'
return output
end

respond_raw('{"type":"ready","protocolVersion":"' .. PROTOCOL_VERSION .. '"}')
local output
local last_digest
for line in io.stdin:lines() do
    if line ~= "" then
        local rtype = proto_str(line, "type")
        if rtype == "run" then
            output = kernel()
            last_digest = sha256(output)
            respond_raw('{"type":"result","requestId":' .. (proto_str(line, "requestId") or "0") .. ',"digest":"' .. last_digest .. '"}')
        elseif rtype == "finish" then
            local out = open(output_file, "w")
            out:write(output)
            out:close()
            respond_raw('{"type":"finish","digest":"' .. last_digest .. '"}')
            break
        end
    end
end
