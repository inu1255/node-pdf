const fs = require("fs");
const Pdf = require("./lib/pdf");
const utils = require("./lib/utils");

async function main() {
	// // '\xa0\xc0\xe8\xde\x8d\x0e^fP\xff\xac"\x0e\x9c_\xb2\xa9(,X\x85\x06:2\xa62UP\xab\xff\x12\xe4'
	// var v = utils.RC4_encrypt('0',utils._encryption_padding);
	// console.log(Array.from(v).map(x=>x.toString(16)));
	// // '\xb8'
	// var v = utils.RC4_encrypt('0','0');
	// console.log(Array.from(v).map(x=>x.toString(16)));
    let pdf = new Pdf();
    pdf.read("a.pdf");
    await pdf.write("out_a.pdf");
    // console.log(pdf);
}

main();