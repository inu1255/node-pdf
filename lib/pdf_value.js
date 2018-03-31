const utils = require("./utils");

class PdfKey {
    /**
     * @param {Buffer} buf 
     */
    decode(buf) {
        if (buf.slice(0, "false".length) == "false") {
            this.v = false;
            return utils.trimHead(buf.slice("false".length));
        } else if (buf.slice(0, "true".length) == "true") {
            this.v = true;
            return utils.trimHead(buf.slice("true".length));
        } else if (buf.slice(0, "null".length) == "null") {
            this.v = null;
            return utils.trimHead(buf.slice("null".length));
        } else {
            console.log(`未知的bool${buf.slice(0,15).toString()}`);
        }
        return buf;
    }
    value(pdf) {
        return this.v;
    }
    toString() {
        if (this.v == null) return "null";
        return this.v ? "true" : "false";
    }
    toBuffer() {
        return new Buffer(this.toString());
    }
}

class PdfNumber {
    /**
     * @param {Buffer} buf 
     */
    decode(buf) {
        let i = 0;
        while (utils.isNumber(buf[i])) i++;
        if (buf[i] == 46) {
            i++;
            while (utils.isNumber(buf[i])) i++;
        }
        this.v = buf.slice(0, i).toString();
        return utils.trimHead(buf.slice(i));
    }
    value(pdf) {
        return parseFloat(this.v);
    }
    toString() {
        return this.v;
    }
    toBuffer() {
        return new Buffer(this.v);
    }
}

class PdfR {
    /**
     * @param {Buffer} buf 
     */
    decode(buf) {
        var [head, buf] = utils.split(buf, "R");
        let ss = head.toString().split(" ");
        this.id = ss[0];
        this.ver = ss[1];
        return utils.trimHead(buf);
    }
    value(pdf) {
        return pdf.obj[this.id].value(pdf);
    }
    toBuffer() {
        return new Buffer(`${this.id} 0 R`);
    }
    toString() {
        return this.id;
    }
}

class PdfString {
    constructor(flag) {
        this.flag = flag;
        this.v;
    }
    /**
     * @param {Buffer} buf 
     */
    decode(buf) {
        this.v = [];
        if (this.flag == "(") {
            for (let i = 1; i < buf.length; i++) {
                if (buf[i - 1] != 92 && buf[i] == 41) {
                    this.v = buf.slice(1, i);
                    for (var n = this.v.indexOf("\\n"); n >= 0; n = this.v.indexOf("\\n")) {
                        this.v = utils.concat([this.v.slice(0, n), '\n', this.v.slice(n + 2)]);
                    }
                    return utils.trimHead(buf.slice(i + 1));
                }
            }
        } else if (this.flag == "<") {
            for (let i = 1; i < buf.length; i++) {
                if (buf[i] == 62) {
                    this.v = utils.hex2buf(buf.slice(1, i));
                    return utils.trimHead(buf.slice(i + 1));
                }
            }
        } else {
            for (let i = 1; i < buf.length; i++) {
                if (!utils.isLetter(buf[i])) {
                    this.v = buf.slice(1, i);
                    return utils.trimHead(buf.slice(i));
                }
            }
        }
        console.log(`未正常结束: ${this}`);
        return new Buffer();
    }
    value(pdf) {
        return this.toString();
    }
    toString() {
        return this.v.toString();
        // return String.fromCharCode.apply(String, this);
    }
    toBuffer() {
        let v = this.v;
        if (this.flag == "(") {
            for (var n = v.indexOf("\n"); n >= 0; n = v.indexOf("\n")) {
                v = utils.concat([v.slice(0, n), '\\n', v.slice(n + 1)]);
            }
            return utils.concat(['(', v, ')']);
        }
        if (this.flag == "<") {
            v = Array.from(v).map(x => x.toString(16)).map(x => x.length < 2 ? "0" + x : x).join("");
            return utils.concat(['<', v, '>']);
        }
        return utils.concat(['/', v]);
    }
}

class PdfArray extends Array {
    /**
     * @param {Buffer} buf 
     */
    decode(buf) {
        let prev = 1;
        for (let i = prev; i < buf.length; i++) {
            while (utils.isSpace(buf[i])) i++;
            let c = buf[i];
            if (c == 93) {
                return utils.trimHead(buf.slice(i + 1));
            } else {
                let nb = buf.slice(i);
                let v = type(nb);
                if (!v) {
                    console.log(`未知的Array value:${nb.slice(0,15).toString()}`);
                }
                nb = v.decode(nb);
                i = buf.length - nb.length - 1;
                this.push(v);
            }
        }
        console.log(`未正常结束: ${this}`);
        return new Buffer();
    }
    value(pdf) {
        return this.map(x => x.value(pdf));
    }
    toBuffer() {
        let bs = [];
        bs.push(`[`);
        for (let item of this) {
            bs.push(item.toBuffer());
            bs.push(` `);
        }
        if (bs.length > 1)
            bs[bs.length - 1] = `]`;
        else
            bs.push(`]`);
        return utils.concat(bs);
    }
}

class PdfDict {
    /**
     * @param {Buffer} buf 
     */
    decode(buf) {
        let prev = 2;
        for (let i = prev; i < buf.length; i++) {
            let c = buf[i];
            if (c == 47) {
                prev = ++i;
                while (utils.isLetter(buf[i])) i++;
                let k = buf.slice(prev, i).toString();
                while (utils.isSpace(buf[i])) i++;
                let nb = buf.slice(i);
                this[k] = type(nb);
                if (!this[k]) {
                    console.log(`未知的Dict value:${nb.slice(0,15).toString()}`);
                }
                nb = this[k].decode(nb);
                i = buf.length - nb.length - 1;
            } else if (c == 62 && buf[i + 1] == 62) {
                return utils.trimHead(buf.slice(i + 2));
            }
        }
        console.log(`未正常结束: ${this}`);
        return new Buffer();
    }
    value(pdf) {
        let node = {};
        for (let k in this) {
            let v = this[k];
            node[k] = v.value(pdf);
        }
        return node;
    }
    toBuffer() {
        let bs = [];
        bs.push(`<<`);
        for (let k in this) {
            bs.push(`/${k} `);
            bs.push(this[k].toBuffer());
            bs.push(` `);
        }
        if (bs.length > 1)
            bs[bs.length - 1] = `>>\n`;
        else
            bs.push(`>>\n`);
        return utils.concat(bs);
    }
}

/**
 * @param {Buffer} buf 
 */
function type(buf) {
    if (buf.slice(0, 2) == "<<") {
        return new PdfDict();
    } else if (buf[0] == 91) {
        return new PdfArray();
    } else if (buf[0] == 47) {
        return new PdfString();
    } else if (buf[0] == 40) {
        return new PdfString("(");
    } else if (buf[0] == 60) {
        return new PdfString("<");
    } else if (utils.isR(buf)) {
        return new PdfR();
    } else if (utils.isNumber(buf[0])) {
        return new PdfNumber();
    } else if (buf[0] == 102 || buf[0] == 116 || buf[0] == 110) {
        return new PdfKey();
    } else {
        buf;
    }
}

module.exports = {
    type,
    PdfKey,
    PdfNumber,
    PdfR,
    PdfString,
    PdfArray,
    PdfDict,
};