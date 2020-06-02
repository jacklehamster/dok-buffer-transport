const expect = require('chai').expect;
const { BufferTransport } = require("./index.js");

describe('BufferTransport', function() {
	it('should transport integers and float', function() {
		const bt = new BufferTransport();
		let value = 0;
		bt.register({
			id: 123,
			parameters: "float,int",
			apply: (n, m) => value = (n * m),
		});
		bt.sendCommand(123, 1.5, 3);
		bt.apply();
		expect(value).to.equal(1.5 * 3);
	});

	it('should transport multiple float', function() {
		const bt = new BufferTransport();
		let value = 0;
		bt.register({
			id: 123,
			parameters: "float*3",
			apply: (a, b, c) => value = (a + b + c),
		});
		bt.sendCommand(123, 1, 2, 3);
		bt.apply();
		expect(value).to.equal(6);
	});

	it('should transport string', function() {
		const bt = new BufferTransport();
		let value = 0;
		bt.register({
			id: 123,
			parameters: "string,int,string",
			apply: (str,n,str2) => value = `${str}_${n}_${str2}`,
		});
		bt.sendCommand(123, "A", 2, "B");
		bt.apply();
		expect(value).to.equal("A_2_B");
	});

	it('should transport object', function() {
		const bt = new BufferTransport();
		let value = 0;
		bt.register({
			id: 123,
			parameters: "object",
			apply: obj => value = obj,
		});
		bt.sendCommand(123, {a: "123"});
		bt.apply();
		expect(value).to.deep.equal({a: "123"});
	});

	it('should transport dataview', function() {
		const bt = new BufferTransport();
		let value = 0;
		bt.register({
			id: 123,
			parameters: "int,[byte,short,float]",
			apply: (a, dataView) => value = [a, dataView],
		});
		bt.sendCommand(123, 1, 100, 1000, 5.5);
		bt.apply();
		expect(value[0]).to.equal(1);
		expect(value[1].getInt8(0)).to.equal(100);
		expect(value[1].getInt16(1, true)).to.equal(1000);
		expect(value[1].getFloat32(3, true)).to.equal(5.5);
	});

	it('should merge gl buffer', function() {
		const bt = new BufferTransport();
		let value = 0;
		bt.register({
			id: 123,
			parameters: "uint,[byte,byte,byte]",
			apply: (a, dataView) => value = [a, dataView],
		});
		bt.sendGLBuffer(123, 1, 0, 1, 2);
		bt.sendGLBuffer(123, 4, 3, 4, 5);
		bt.apply();
		expect(value[1].getInt8(0)).to.equal(0);
		expect(value[1].getInt8(1)).to.equal(1);
		expect(value[1].getInt8(2)).to.equal(2);
		expect(value[1].getInt8(3)).to.equal(3);
		expect(value[1].getInt8(4)).to.equal(4);
		expect(value[1].getInt8(5)).to.equal(5);
	});
});
