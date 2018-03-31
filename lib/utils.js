const crypto = require('crypto');

exports.md5 = function(chunk) {
    let m = crypto.createHash("md5");
    chunk && m.update(chunk);
    return m;
};

/**
 * @param {Buffer} buf 
 * @param {String} s 
 */
exports.split = function(buf, s) {
    if (s) {
        let i = buf.indexOf(s);
        if (i < 0) i = buf.length;
        return [exports.trimHead(buf.slice(0, i)), exports.trimHead(buf.slice(i + s.length))];
    }
    let i = 0;
    while (i < buf.length && buf[i] != 10 && buf[i] != 13) i++;
    return [exports.trimHead(buf.slice(0, i)), exports.trimHead(buf.slice(i + 1))];
};

exports.trimHead = function(buf) {
    let i = 0;
    while (exports.isSpace(buf[i])) i++;
    return buf.slice(i);
};

exports.isNumber = function(c) {
    return c <= 57 && c >= 48 || c == 45;
};

exports.isLetter = function(c) {
    return c <= 57 && c >= 48 || c <= 122 && c >= 97 || c <= 90 && c >= 65 || c == 45 || c == 95;
};

exports.isSpace = function(c) {
    return c == 32 || c == 9 || c == 10 || c == 13;
};

exports.isR = function(buf) {
    let i = 0;
    if (!exports.isNumber(buf[i++])) return false;
    while (exports.isNumber(buf[i])) i++;
    if (buf[i++] != 32) return false;
    if (!exports.isNumber(buf[i++])) return false;
    while (exports.isNumber(buf[i])) i++;
    if (buf[i++] != 32) return false;
    if (buf[i] != 82) return false;
    return true;
};

/**
 * @param {String} hex 
 */
exports.hex2buf = function(hex) {
    if (hex.length & 1) hex += "0";
    let buf = new Buffer(Math.floor(hex.length / 2));
    for (let i = 0; i < hex.length; i += 2) {
        buf[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return buf;
};

/**
 * @param {Buffer[]} buffers 
 */
exports.concat = function(buffers) {
    let data;
    buffers = buffers.map(x => x instanceof Buffer ? x : new Buffer(x));
    switch (buffers.length) {
        case 0:
            data = new Buffer(0);
            break;
        case 1:
            data = buffers[0];
            break;
        default:
            data = new Buffer(buffers.reduce((a, b) => a + b.length, 0));
            let prev = 0;
            for (let i = 0; i < buffers.length; i++) {
                const buf = buffers[i];
                buf.copy(data, prev);
                prev += buf.length;
            }
            break;
    }
    return data;
};
const _encryption_padding = exports.hex2buf("28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a");
exports._encryption_padding = _encryption_padding;
exports._alg34 = function(password, owner_entry, p_entry, id1_entry) {
    let key = exports._alg32(password, 2, 5, owner_entry, p_entry, id1_entry);
    let U = exports.RC4_encrypt(key, _encryption_padding);
    return [U, key];
};
exports.enhex = function(num) {
	num = +num;
    let s = (num & 0xff).toString(16) + (num >> 8 & 0xff).toString(16) + (num >> 16 & 0xff).toString(16) + (num >> 24 & 0xff).toString(16);
    return exports.hex2buf(s);
};
exports._alg32 = function(password, rev, keylen, owner_entry, p_entry, id1_entry, metadata_encrypt = true) {
    password = exports.concat([password, _encryption_padding]).slice(0, 32);
    let m = exports.md5(password);
    m.update(owner_entry);
    p_entry = exports.enhex(p_entry);
    m.update(p_entry);
    m.update(id1_entry);
    if (rev >= 3 && !metadata_encrypt)
        m.update(new Buffer("\xff\xff\xff\xff"));
    let md5_hash = m.digest();
    if (rev >= 3)
        for (let i = 0; i < 50; i++)
            md5_hash = exports.md5(md5_hash.slice(0, keylen)).digest();
    return md5_hash.slice(0, keylen);
};
exports._alg33_1 = function(password, rev, keylen) {
    password = (password + _encryption_padding).slice(0, 32);
    let m = exports.md5(password);
    let md5_hash = m.digest();
    if (rev >= 3)
        for (let i = 0; i < 50; i++)
            md5_hash = exports.md5(md5_hash).digest();
    let key = md5_hash.slice(0, keylen);
    return key;
};

exports.RC4_encrypt1 = function(key, text) {
    let decipher = crypto.createDecipheriv("rc4", key, '');
    let decrypted = decipher.update(text, "binary", "binary");
    return exports.concat([decrypted, decipher.final("binary")]);
};

exports.swap = function(S, i, j) {
    let t = S[i];
    S[i] = S[j];
    S[j] = t;
};

exports.RC4_encrypt = function(key, plaintext) {
    key = new Buffer(key);
    plaintext = new Buffer(plaintext);
    let S = [];
    for (var i = 0; i < 256; i++) S.push(i);
    let j = 0;
    for (var i = 0; i < 256; i++) {
        j = (j + S[i] + key[i % key.length]) % 256;
        exports.swap(S, i, j);
    }
    i = j = 0;
    let retval = [];
    for (var x = 0; x < plaintext.length; x++) {
        i = (i + 1) % 256;
        j = (j + S[i]) % 256;
        exports.swap(S, i, j);
        let t = S[(S[i] + S[j]) % 256];
        retval.push(plaintext[x] ^ t);
    }
    return new Buffer(retval);
};