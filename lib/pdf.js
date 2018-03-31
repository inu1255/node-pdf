const fs = require("fs");
const zlib = require("zlib");
const PdfObject = require("./pdf_object");
const utils = require("./utils");
const pdf_value = require("./pdf_value");

class Pdf {
    constructor() {
        /** @type {Number} */
        this.version;
        this.obj = {};
    }
    read(filename) {
        var offset = 0;
        var buf = fs.readFileSync(filename);
        var [line, buf] = utils.split(buf);
        offset += line.length + 1;
        let text = line.toString();
        if (!text.startsWith("%PDF-"))
            console.log(`${filename}: PDF头不正确`);
        this.version = parseFloat(text.slice("%PDF-".length));
        let prev = buf.length;
        while (buf && buf.length) {
            offset += prev - buf.length;
            prev = buf.length;
            if (/^\d+ \d+ obj/.test(buf)) {
                let obj = new PdfObject(offset);
                buf = obj.decode(buf);
                this.obj[obj.id] = obj;
            } else if (buf.slice(0, "xref".length) == "xref") {
                this.startxref = offset;
                buf = utils.trimHead(buf.slice("xref".length + 1));
                while (true) {
                    var [line, rest] = utils.split(buf);
                    if (!/^\d+ \d+$/.test(line)) break;
                    buf = rest;
                    let ss = line.toString().split(" ");
                    let i = ss[0];
                    let count = ss[1];
                    while (count--) {
                        var [line, buf] = utils.split(buf);
                        ss = line.toString().split(" ");
                        let id = i++;
                        let pos = ss[0];
                        let ver = ss[1];
                        let flag = ss[2];
                        // console.log(`#${id} offset:${pos} ver:${ver} flag:${flag}`);
                    }
                }
            } else if (buf.slice(0, "startxref".length) == "startxref") {
                buf = utils.split(utils.trimHead(buf.slice("startxref".length + 1)))[1];
            } else if (buf.slice(0, "trailer".length) == "trailer") {
                buf = utils.trimHead(buf.slice("trailer".length + 1));
                this.trailer = pdf_value.type(buf);
                buf = this.trailer.decode(buf);
            } else if (buf.slice(0, "%%EOF".length) == "%%EOF") {
                buf = utils.trimHead(buf.slice("%%EOF".length + 1));
            } else if (buf[0] == 37) {
                buf = utils.split(buf)[1];
            } else {
                console.log(`未知的字段: ${buf.slice(0,15)}`);
                break;
            }
        }
        // this._decrypt('');
        // this._root = this.obj[this.trailer.Root].value(this);
        // for (let k in this.obj) {
        //     let v = this.obj[k];
        //     if (v.stream) {
        //         let key = this.decrypy(v);
        //         let stream = utils.RC4_encrypt(key, v.stream);
        //         stream = v.getStream(stream);
        //         // var s = [];
        //         // stream.toString().replace(/\(([^\)]+)\)/g, (x0, x1) => s.push(x1));
        //         // s = s.join(" ").replace(/\\\(/g, "(").replace(/\\ /, ")");
        //         if (/SHENZHEN[\s\)]/.test(stream)) {
        //             console.log("删除", v.id);
        //             // delete v.property.Filter;
        //             // let i = stream.indexOf('©');
        //             v.stream = ''; //utils.RC4_encrypt(key, utils.concat([stream.slice(0, i), stream.slice(i + 1)]));
        //         }
        //         // else if (s.indexOf('Provided by IHS under license') >= 0) {
        //         //     console.log("删除", v.id);
        //         //     v.stream = '';
        //         // }
        //     }
        // }
    }
    write(filename) {
        return new Promise((resolve, reject) => {
            let xref = [{ id: 0, offset: 0 }];
            let offset = 0;
            let stream = fs.createWriteStream(filename);
            stream.w = stream.write;
            stream.write = chunk => {
                offset += chunk.length;
                stream.w(chunk);
            };
            stream.write(`%PDF-${this.version}\n`);
            for (let k in this.obj) {
                xref.push({ id: k, offset });
                let v = this.obj[k];
                stream.write(v.toBuffer());
            }
            let startxref = offset;
            stream.write(`xref\n`);
            for (let i = 0; i < xref.length;) {
                let end = i;
                let start = xref[i].id;
                let prev = start;
                while (++end < xref.length && xref[end].id - prev <= 1) {
                    prev = xref[end].id;
                }
                stream.write(`${start} ${end-i}\n`);
                while (i < end) {
                    if (i == 0) {
                        stream.write(`0000000000 65535 f \n`);
                    } else {
                        let n = (xref[i].offset + 10000000000).toString().slice(1);
                        stream.write(`${n} 00000 n \n`);
                    }
                    i++;
                }
            }
            stream.write(`trailer\n`);
            delete this.trailer.Prev;
            stream.write(this.trailer.toBuffer());
            stream.write(`startxref\n`);
            stream.write(`${startxref}\n`);
            stream.write(`%%EOF`);
            stream.end();
            stream.on('finish', resolve);
            stream.on('error', reject);
        });
    }
    decrypy(obj) {
        let decryption_key = this._decryption_key;
        let key = utils.concat([decryption_key, utils.enhex(obj.id).slice(0, 3), utils.enhex(obj.ver).slice(0, 2)]);
        let md5_hash = utils.md5(key).digest();
        key = md5_hash.slice(0, Math.min(16, decryption_key.length + 5));
        return key;
    }
    _authenticateUserPassword(encrypt, password) {
        let rev = encrypt['R'];
        let owner_entry = encrypt['O'].v;
        let p_entry = encrypt['P'].v;
        let id1_entry = this.trailer['ID'][0].v;
        let real_U = encrypt['U'].v;
        if (rev == 2) {
            var [U, key] = utils._alg34(password, owner_entry, p_entry, id1_entry);
        } else if (rev >= 3) {
            var [U, key] = utils._alg35(password, rev, Math.floor(encrypt["Length"] / 8), owner_entry, p_entry, id1_entry, encrypt["EncryptMetadata"]);
            U = U.slice(0, 16);
            real_U = real_U.slice(0, 16);
        }
        return [!U.compare(real_U), key];
    }
    _decrypt(password) {
        let encrypt = this.trailer['Encrypt'];
        if (encrypt) {
            console.log("解密中...");
            encrypt = this.obj[encrypt.id].property;
            if (encrypt['Filter'] != 'Standard') {
                console.log(`不支持的加密方式:${encrypt['Filter']}`);
                return;
            }
            if (["1", "2"].indexOf(encrypt['V'].v) < 0) {
                console.log(`不支持的算法 V:${encrypt['V']}`);
                return;
            }
            var [user_password, key] = this._authenticateUserPassword(encrypt, password);
            let rev, keylen;
            if (user_password) {
                this._decryption_key = key;
                return 1;
            } else
                rev = encrypt['R'].v;
            if (rev == 2)
                keylen = 5;
            else
                keylen = encrypt['Length'].v; // 8
            key = utils._alg33_1(password, rev, keylen);
            let real_O = encrypt["O"].v;
            let userpass, val, new_key;
            if (rev == 2)
                userpass = utils.RC4_encrypt(key, real_O);
            else {
                val = real_O;
                for (let i = 19; i >= 0; i--) {
                    new_key = '';
                    for (let l = 0; l < key.length; l++) {
                        new_key += String.fromCharCode(key[l] ^ i);
                    }
                    val = utils.RC4_encrypt(new_key, val);
                }
                userpass = val;
            }
            var [owner_password, key] = this._authenticateUserPassword(encrypt, userpass);
            if (owner_password) {
                this._decryption_key = key;
                return 2;
            }
            return 0;
        }
    }
}

module.exports = Pdf;