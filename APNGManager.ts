/*
	source-JS: https://github.com/davidmz/apng-js
	2018-01-25 wq5514 @momoid:284228203
*/

class APNGManager {
	private static Instance:APNGManager;
	private apngList: any;
	private apngPauseList: any;

	public static getInstance():APNGManager
	{
		if (!APNGManager.Instance)
			APNGManager.Instance = new APNGManager();
		return APNGManager.Instance;
	}

	private constructor(){
		this.apngList = [];
		this.apngPauseList = [];
	}

	/**
	 * 	获取一个eui.group，其中包含一个egret.BitmapData
	 ** path: apng图片在preload里的名称，注意==>在default.res.json里面类型要选择bin，不要选image
	 ** playRate: 播放比例，0.1~2.0，默认为1

 * 		测试代码：
 * 
 * 		let group_apng = APNGManager.getInstance().getGroup("panda_png");
		this.testGroup.addChild(group_apng);
	*/
    private getClamp(value:number, min:number, max:number):number {
        if (value > max) {
            return max;
        }
        if (value < min) {
            return min;
        }
        return value;
    }

	public getGroup(path: string, playRate: number = 1 ): eui.Group{
		if(!this.apngList[path]){
			let buffer = RES.getRes(path);
			this.apngList[path] = this.parseAPNG(buffer);
		}
		let apng = this.apngList[path];

		let group = new eui.Group();
		if(apng != ""){
			playRate = this.getClamp(playRate, 0.1, 2);
			let totalTime = apng.playTime/playRate;
			let frameDelay = apng.frames[0].delay/playRate;
            let index = 0;
            let maxNum = apng.frames.length;
			let bitmap = new egret.Bitmap();
            group.width = apng.width;
            group.height = apng.height;
			group.addChild(bitmap);
            let markId = setInterval(()=>{
				if(this.apngPauseList[group.name]){
					return;
				}
                let frame = apng.frames[index];
                if(frame.bitmapData){
                    bitmap.bitmapData = frame.bitmapData;
                    bitmap.x = frame.left;
                    bitmap.y = frame.top;
                    bitmap.width = frame.width;
                    bitmap.height = frame.height;
					index++;
					if(index == maxNum-1){
						index = 0;
					}
				}else if(!frame.isLoading){
                    const url = URL.createObjectURL(frame.imageData);
                    let saveImage = new Image();
                    saveImage.src = url;
                    saveImage.onload = () => {
                        saveImage.onload = null;
                        let bitmapData = new egret.BitmapData(saveImage);
                        frame.bitmapData = bitmapData;
						frame.imageData = null;
						saveImage = null;
                    }
					frame.isLoading = true;
					// document.getElementById("player").appendChild(saveImage);
                }
            }, frameDelay);
			group.name = markId.toString();
			group.once(egret.Event.REMOVED_FROM_STAGE, ()=>{
				this.stopGroup(group);
			}, this);
		}
		return group;
	}

	/**
		暂停动画
	*/
	public pauseGroup(group: eui.Group): void{
		if(group.name == ""){
			return;
		}
		this.apngPauseList[group.name] = true;
	}
	/**
		播放动画
	*/
	public playGroup(group: eui.Group): void{
		if(group.name == ""){
			return;
		}
		this.apngPauseList[group.name] = false;
	}
	/**
		停止并清空动画tick
	*/
	public stopGroup(group: eui.Group): void{
		if(group.name == ""){
			return;
		}
		clearInterval(Number(group.name));
	}

	/**
		读取解析apng数据，buffer需要apng的类型配置为bin
	*/
	public parseAPNG(buffer): any{
		const bytes = new Uint8Array(buffer);
		const PNGSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	    if (Array.prototype.some.call(PNGSignature, (b, i) => b !== bytes[i])) {
			console.error("Not a PNG")
			return "";
		}
		// fast animation test
		let isAnimated = false;
		this.eachChunk(bytes, type => !(isAnimated = (type === 'acTL')));
		if (!isAnimated) {
			console.error("Not an animated PNG")
			return "";
		}

		const
			preDataParts = [],
			postDataParts = [];
		let
			headerDataBytes = null,
			frame = null,
			frameNumber = 0,
			apng = new APNGInfo();

		this.eachChunk(bytes, (type, bytes, off, length) => {
			const dv = new DataView(bytes.buffer);
			switch (type) {
				case 'IHDR':
					headerDataBytes = bytes.subarray(off + 8, off + 8 + length);
					apng.width = dv.getUint32(off + 8);
					apng.height = dv.getUint32(off + 12);
					break;
				case 'acTL':
					apng.numPlays = dv.getUint32(off + 8 + 4);
					break;
				case 'fcTL':
					if (frame) {
						apng.frames.push(frame);
						frameNumber++;
					}
					frame = new APNGFrameInfo();
					frame.width = dv.getUint32(off + 8 + 4);
					frame.height = dv.getUint32(off + 8 + 8);
					frame.left = dv.getUint32(off + 8 + 12);
					frame.top = dv.getUint32(off + 8 + 16);
					var delayN = dv.getUint16(off + 8 + 20);
					var delayD = dv.getUint16(off + 8 + 22);
					if (delayD === 0) {
						delayD = 100;
					}
					frame.delay = 1000 * delayN / delayD;
					// https://bugzilla.mozilla.org/show_bug.cgi?id=125137
					// https://bugzilla.mozilla.org/show_bug.cgi?id=139677
					// https://bugzilla.mozilla.org/show_bug.cgi?id=207059
					if (frame.delay <= 10) {
						frame.delay = 100;
					}
					apng.playTime += frame.delay;
					frame.disposeOp = dv.getUint8(off + 8 + 24);
					frame.blendOp = dv.getUint8(off + 8 + 25);
					frame.dataParts = [];
					if (frameNumber === 0 && frame.disposeOp === 2) {
						frame.disposeOp = 1;
					}
					break;
				case 'fdAT':
					if (frame) {
						frame.dataParts.push(bytes.subarray(off + 8 + 4, off + 8 + length));
					}
					break;
				case 'IDAT':
					if (frame) {
						frame.dataParts.push(bytes.subarray(off + 8, off + 8 + length));
					}
					break;
				case 'IEND':
					postDataParts.push(this.subBuffer(bytes, off, 12 + length));
					break;
				default:
					preDataParts.push(this.subBuffer(bytes, off, 12 + length));
			}
		});

		if(frame){
			apng.frames.push(frame);
		}
		if(apng.frames.length == 0){
			console.error('Not an animated PNG');
			return "";
		}
		const preBlob = new Blob(preDataParts),
			postBlob = new Blob(postDataParts);
		

		apng.frames.forEach(frame => {
			var bb = [];
			bb.push(PNGSignature);
			headerDataBytes.set(this.makeDWordArray(frame.width), 0);
			headerDataBytes.set(this.makeDWordArray(frame.height), 4);
			bb.push(this.makeChunkBytes('IHDR', headerDataBytes));
			bb.push(preBlob);
			frame.dataParts.forEach(p => bb.push(this.makeChunkBytes('IDAT', p)));
			bb.push(postBlob);
			frame.imageData = new Blob(bb, {'type': 'image/png'});
			delete frame.dataParts;
			bb = null;
		});

		return apng;
	}

	private eachChunk(bytes, callback):void{
		const dv = new DataView(bytes.buffer);
		let off = 8, type, length, res;
		do {
			length = dv.getUint32(off);
			type = this.readString(bytes, off + 4, 4);
			res = callback(type, bytes, off, length);
			off += 12 + length;
		} while (res !== false && type != 'IEND' && off < bytes.length);
	}

	private readString(bytes, off, length) {
		const chars = Array.prototype.slice.call(bytes.subarray(off, off + length));
		return String.fromCharCode.apply(String, chars);
	}

	private makeStringArray(x) {
		const res = new Uint8Array(x.length);
		for (let i = 0; i < x.length; i++) {
			res[i] = x.charCodeAt(i);
		}
		return res;
	}

	private subBuffer(bytes, start, length) {
		const a = new Uint8Array(length);
		a.set(bytes.subarray(start, start + length));
		return a;
	}

	private makeChunkBytes = function (type, dataBytes) {
		const crcLen = type.length + dataBytes.length;
		const bytes = new Uint8Array(crcLen + 8);
		const dv = new DataView(bytes.buffer);

		dv.setUint32(0, dataBytes.length);
		bytes.set(this.makeStringArray(type), 4);
		bytes.set(dataBytes, 8);
		var crc = this.crc32(bytes, 4, crcLen);
		dv.setUint32(crcLen + 4, crc);
		return bytes;
	};

	private makeDWordArray = function (x) {
		return new Uint8Array([(x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff]);
	};

	private crc32(bytes, start = 0, length = bytes.length - start) {
		const table = new Uint32Array(256)

		for (let i = 0; i < 256; i++) {
			let c = i
			for (let k = 0; k < 8; k++) {
				c = ((c & 1) !== 0) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
			}
			table[i] = c
		}
		let crc = -1
		for (let i = start, l = start + length; i < l; i++) {
			crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF]
		}
		return crc ^ (-1)
	};
}

class APNGInfo {
	public width: number;
	public height: number;
	public numPlays: number;
	public playTime: number;
	public frames: APNGFrameInfo[];

	public constructor(){
		this.width = 0;
		this.height = 0;
		this.numPlays = 0;
		this.playTime = 0;
		this.frames = [];
	}
}

class APNGFrameInfo {
	public left: number;
	public top: number;
	public width: number;
	public height: number;
	public delay: number;
	public disposeOp: number;
	public blendOp: number;
	public imageData: Blob;
	// public imageElement: HTMLImageElement;
	public dataParts: any;
	public bitmapData: egret.BitmapData;
	public isLoading: boolean;

	public constructor(){
		this.left = 0;
		this.top = 0;
		this.width = 0;
		this.height = 0;
		this.delay = 0;
		this.disposeOp = 0;
		this.blendOp = 0;
		this.imageData = null;
		this.dataParts = [];
		this.bitmapData = null;
		this.isLoading = false;
	}
}
