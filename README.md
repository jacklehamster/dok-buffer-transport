# dok-buffer-transport
System for serializing and transporting data via ArrayBuffer between a worker and a main thread.

______

Workers are a way to improve performance by offloading computations to a background threads. Passing data between a the worker and the main thread can be a performance hit though, unless it is passed by reference through an ArrayBuffer as follow:

```javascript
self.postMessage(payload, [payload.buffer]);
```

The ArrayBuffer gets passed without copy from worker to main thread or vice-versa.

To help with that, this package provides a system for serializing data into an ArrayBuffer and passing it from worker to main thread. This library is optimized for gaming, so it supports passing data continously within a game loop.

## Usage

First, on the receiving end (likely the main thread), register commands into your BufferTransporter as follow:

```javascript
const bufferTransport = new BufferTransport();
bufferTransport.register({
			id: Commands.SCORE,	// unsigned byte (integer from 0..255)
			parameters: "int",
			apply: score => showScore(score),
		}, {
			id: Commands.MOVE,
			parameters: "float,float,float",
			apply: (x,y,z) => moveTo(x,y,z),
		});
```

Inside your worker, also instantiate a bufferTransport, then send commands into it.

```javascript
const bufferTransport = new BufferTransport();
bufferTranport.sendCommand(Commands.SCORE, 333);
bufferTransport.sendCommand(Command.MOVE, 5, 15, 3.3);
```

Then once you've sent all your command, pass the ArrayBuffer through with the worker's postMessage command.

```javascript
const { dataView, byteCount } = bufferTransport;
self.postMessage({
  dataView,
  byteCount,
}, [dataView.buffer]);
```

The byteCount determines the effect number of bytes, but the dataView itself has a capacity of 8,000,000 bytes. Since we don't want to continously produce ArrayBuffers, on the main thread, you need to pass the ArrayBuffer back to the worker right after usage.

```javascript
worker.addEventListener("message", event => {
  const { dataView, byteCount} = event.data;
  bufferTransport.setup(dataView, byteCount);
  bufferTransport.apply();	//	this executes all commands
  worker.postMessage({
			action: "returnBuffer",
			dataView,
		}, [ dataView.buffer ]);
});
```

On the worker side, put back the dataView into the BufferTransport class.

```javascript
self.addEventListener('message', function(event) {
  if (event.data.action === "returnBuffer") {
    bufferTransport.returnBuffer(event.data.dataView);
  }
});
```

Note that the worker doesn't slow down to wait for the ArrayBuffer to be returned. It will continously work and produce new ArrayBuffers while waiting for the payload from main thread to be returned. This creates a cycle of ArrayBuffers that get passed into the main thread and returned to the worker. At 60fps, approximately, we get around 8-10 array buffers going around in circles.

## Advanced Usage

Note that this system was meant to pass a large amount of data, fetching properties from sprites and sending them into array buffers directly consumable by WebGL. With the various options below, you can effectively use this library for that.

### Registering parameters

Here are all the types you can use for defining the data you need to pass:

- `boolean`: True / False
- `ubyte, byte`: Bytes. Signed (-128,127) or unsigned (0..255)
- `ushort, short`: Short or 16bit integers. Signed and unsigned.
- `uint, int`: 32 bit signed or unsigned integer.
- `float`: 32 bit floating point.
- `string`: A "string"
- `object`: A serializable javascript object { field: "value" }.
- `array`: A serializable javascript array.
- `dataView`: A [DataView](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView) object.

For better performance, avoid using object, array and string.

### Multiple parameters

You can pass parameters in a sequence during registration:

```javascript
bufferTransport.register({
  ...
  parameters: "int,float,string",
});
```

You can use the `*` operator to repeat the type.

```javascript
bufferTransport.register({
  ...
  parameters: "float*24",
});
```

This means that the command expects 24 floats.

### Passing DataView

This is how BufferTransport is primarily meant to be used.

```javascript
bufferTransport.register({
  ...
  parameters: "uint,[byte,byte,byte,byte]",
});
```

Notice the brackets `[]`. Those determine that you want to have a DataView as the second parameter, and that it will be composed of 4 bytes. On the sender end (worker), the parameters are inputed sequentially:

```javascript
bufferTransport.sendCommand(COMMAND, 10000, 1, 2, 3, 4);
```

This sets the `uint` parameter to 10000, and the DataView as an ArrayBuffer of 4 bytes containing `[1,2,3,4]`. On the receiving end however, you get a DataView.

```javascript
bufferTransport.register({
  ...
  parameters: "uint,[byte,byte,byte,byte]",
  apply: (offset, dataView) => process(offset, dataView),
});
```

The function `process` will be called with 2 parameters, and offset set to 10000 and a DataView with 4 bytes, 1, 2, 3, 4.

*The main purpose for using this is to pass data continously as array buffer, and load them directly into WebGL using gl.bufferSubData:*

```javascript
gl.bufferSubData(gl.ARRAY_BUFFER, offset, buffer);
```

Let's say you are sending a sprite, with x,y,z coordinates for its 4 corners. You would be sending 12 floating points and the command would be something like this:

```javascript
bufferTransport.register({
  ...
  parameters: "uint,[float*12]",
  apply: (offset, dataView) => {
		gl.bindBuffer(vertexBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, offset, dataView);
  }
});
```

### Merge DataView

It is common to be sending several sprite continously. Therefore, you might end up with several sequential updates on the same buffer:

- offset: 0, dataView: [3.5,3.5,3.5]
- offset: 12, dataView: [0,2.5,6.0],
- offset: 24, dataView: [10,100.0,7.5],

It would be inefficient for WebGL to repeatedly call bufferSubData for every single sprite. So for sequencial sprite, we have the option to merge DataView.

For that, we first have to assume that buffer for WebGL will be sent in a very specific format: First the offset of the GL buffer, then the dataView.

```javascript
bufferTransport.register({
  ...
  parameters: "uint,[float*12]",
  apply: (offset, dataView) => process(offset, dataView),
});
```

Then instead of using `sendCommand`, we call `bufferTransport.sendGLBuffer`

```javascript
bufferTransport.sendGLBuffer(Command.MOVE, offset, x, y, z, x, y, z ...)
```

When two sequential commands are sent, internally, BufferTransport understands that the same command was issued twice, and an offset follows the previous one without leaving any gap. It then merges the DataView instead separating into two separate commands.

When `process` gets called, the first paramter will be the offset of the first command, and the dataView will be of size 24 floats (24*4 bytes), containing the data for two sequential commands. This helps reduce let's say 1000 calls to bufferSubData into a single one.



## Future Improvements

We should be able to further improve performance by allowing sending multiple smaller ArrayBuffers, rather than a giant 8mb one between worker and main thread (the main concern is not that we are copying 8mb, but simply that it does take a lot of memory, especially if we have several ArrayBuffers).

By splitting the large ArrayBuffer into smaller chunks, we can be can save space, because we would have smaller ArrayBuffer mostly at capacity.