const utils = require("./utils");
const zlib = require("zlib");
const pdf_value = require("./pdf_value");

class PdfObject {
    constructor(offset) {
        this.offset = offset || 0;
    }
    /**
     * @param {Buffer} buf 
     */
    decode(buf) {
        var [head, buf] = utils.split(buf, "obj");
        let ss = head.toString().split(" ");
        this.id = ss[0];
        this.ver = ss[1];
        var [buf, rest] = utils.split(buf, "endobj");
        while (buf.length > 0) {
            if (!this.property) {
                let v = pdf_value.type(buf);
                if (v) {
                    this.property = v;
                    buf = this.property.decode(buf);
                    continue;
                }
            }
            if (buf.slice(0, "stream".length) == "stream") {
                let i = buf.indexOf("endstream");
                if (i < 0) {
                    console.log(`对象#${this.id}没有找到 endstream`);
                    return this;
                }
                let begin = "stream".length;
                if (buf.slice(begin, begin + 2) == "\r\n") begin += 2;
                else begin += 1;
                let end = i;
                if (buf.slice(end - 2, end) == "\r\n") end -= 2;
                else end -= 1;
                this.stream = buf.slice(begin, end);
                // if (this.property["Filter"] == "FlateDecode")
                //     this.stream = zlib.unzipSync(this.stream);
                buf = buf.slice(i + "endstream".length + 1);
            } else {
                console.log(`#${this.id} 未知的开头: ${buf.slice(0,15).toString()}`);
            }
        }
        return rest;
    }
    value(pdf) {
        if (this._value) return this._value;
        this._value = {};
        let item = this.property.value(pdf);
        if (this.stream) {
            if (pdf._decryption_key) {
                let key = pdf.decrypy(this);
                item.stream = utils.RC4_encrypt(key, this.stream);
            }
            item.stream = this.getStream(item.stream);
        }
        return Object.assign(this._value, item);
    }
    getStream(stream) {
        if (this.property["Filter"] == "FlateDecode") try {
            return zlib.unzipSync(stream || this.stream);
        } catch (error) {
            console.log(`#${this.id}: ${error}`);
        }
        return stream || this.stream;
    }
    toBuffer() {
        let bs = [];
        bs.push(`${this.id} 0 obj\n`);
        bs.push(this.property.toBuffer());
        if (this.stream) {
            bs.push(`stream\n`);
            let stream = this.stream;
            // if (this.property["Filter"] == "FlateDecode")
            // 	stream = zlib.gzipSync(stream);
            bs.push(stream);
            bs.push(`\nendstream\n`);
        }
        bs.push(`endobj\n`);
        return utils.concat(bs);
    }
}

module.exports = PdfObject;