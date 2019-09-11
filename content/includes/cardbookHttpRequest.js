"use strict";

 var CardbookHttpRequest = class {
	constructor() {
		// a private object to store xhr related properties
		this.xhr = {};
		this.xhr.useStreamLoader = true;
		this.xhr.headers = {};
		this.xhr.readyState = 0;
		this.xhr.responseStatus = null;
		this.xhr.responseStatusText = null;
		this.xhr.responseText = null;
		this.xhr.httpchannel = null;
		this.xhr.mozBackgroundRequest = false;		
		this.xhr.method = null;
		this.xhr.uri = null;
		this.xhr.async = true;
		this.xhr.user = "";
		this.xhr.password = "";
		this.xhr.timeout = 0;
		this.xhr.timer = Components.classes["@mozilla.org/timer;1"].createInstance(
                      Components.interfaces.nsITimer);

		this.onreadystatechange = function () {};
		this.onerror = function () {};
		this.onload = function () {};
		this.ontimeout = function () {};
		
		var self = this;
		this.listener = {
			_data: "",
			_stream: null,

			//nsIStreamListener (aUseStreamLoader = false)
			onStartRequest: function(aRequest, aContext) {
				//Services.console.logStringMessage("[onStartRequest] ");
				this._data = "";
			},
			onDataAvailable: function (aRequest, aContext, aInputStream, aOffset, aCount) {
				//Services.console.logStringMessage("[onDataAvailable] " + aCount);
				if (this._stream == null) {
					this._stream = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance(Components.interfaces.nsIScriptableInputStream);
					this._stream.init(aInputStream);
				}
				let d = this._stream.read(aCount);
				this._data += d;
			},        
			onStopRequest: function(aRequest, aContext, aStatusCode) {
				//Services.console.logStringMessage("[onStopRequest] " + aStatusCode);
				this.processResponse(aRequest.QueryInterface(Components.interfaces.nsIHttpChannel), aContext, aStatusCode,  this._data);
			},
		


			//nsIStreamLoaderObserver (aUseStreamLoader = true)
			onStreamComplete: function(aLoader, aContext, aStatus, aResultLength, aResult) {
				let result = self._convertByteArray(aResult);  
				this.processResponse(aLoader.request.QueryInterface(Components.interfaces.nsIHttpChannel), aContext, aStatus, result);
			},
			
			processResponse: function(aChannel, aContext, aStatus, aResult) {
				self.xhr.httpchannel = aChannel;
				self.xhr.responseText = aResult;
				self.xhr.responseStatus = aStatus;
				
				try {
					self.xhr.responseStatus = aChannel.responseStatus;
				} catch (ex) {
					console.log("Error: " + self.xhr.responseStatus);
					self.onerror();
					return;
				}
				self.xhr.responseStatusText = aChannel.responseStatusText;
				self.xhr.responseText = aResult;
				self.xhr.readyState = 4;
				self.onreadystatechange();				
				console.log("OK: " + self.xhr.responseStatus);
				self.onload();
			}
		}		
	}

	/** private **/
	
	_b64EncodeUnicode (aString) {
		return btoa(encodeURIComponent(aString).replace(/%([0-9A-F]{2})/g, function(match, p1) {
			return String.fromCharCode('0x' + p1);
		}));
	}

	// copied from lightning
	_prepHttpChannelUploadData(aHttpChannel, aMethod, aUploadData, aContentType) {
		if (aUploadData) {
			aHttpChannel.QueryInterface(Components.interfaces.nsIUploadChannel);
			let stream;
			if (aUploadData instanceof Components.interfaces.nsIInputStream) {
				// Make sure the stream is reset
				stream = aUploadData.QueryInterface(Components.interfaces.nsISeekableStream);
				stream.seek(Components.interfaces.nsISeekableStream.NS_SEEK_SET, 0);
			} else {
				// Otherwise its something that should be a string, convert it.
				let converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
					.createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
				converter.charset = "UTF-8";
				stream = converter.convertToInputStream(aUploadData.toString());
			}

		  // If aContentType is empty, the protocol will assume that no content headers are to be
		  // added to the uploaded stream and that any required headers are already encoded in
		  // the stream. In the case of HTTP, if this parameter is non-empty, then its value will
		  // replace any existing Content-Type header on the HTTP request. In the case of FTP and
		  // FILE, this parameter is ignored.
		  aHttpChannel.setUploadStream(stream, aContentType, -1);
		}	

		//must be set after setUploadStream
		//https://developer.mozilla.org/en-US/docs/Mozilla/Creating_sandboxed_HTTP_connections
		aHttpChannel.QueryInterface(Ci.nsIHttpChannel);
		aHttpChannel.requestMethod = aMethod;
	}
  
	/**
     * Convert a byte array to a string - copied from lightning
     *
     * @param {octet[]} aResult         The bytes to convert
     * @param {String} aCharset         The character set of the bytes, defaults to utf-8
     * @param {Boolean} aThrow          If true, the function will raise an exception on error
     * @returns {?String}                The string result, or null on error
     */
	_convertByteArray(aResult, aCharset="utf-8", aThrow) {
        try {
            return new TextDecoder(aCharset).decode(Uint8Array.from(aResult));
        } catch (e) {
            if (aThrow) {
                throw e;
            }
        }
        return null;
    }
	
	_startTimeout() {
		let rv = Components.results.NS_ERROR_NET_TIMEOUT;
		let xhr = this.xhr;
		let event = {
			notify: function(timer) {
				if (xhr.httpchannel) xhr.httpchannel.cancel(rv);
			}
		}
		this.xhr.timer.initWithCallback(
			event, 
			this.xhr.timeout, 
			Components.interfaces.nsITimer.TYPE_ONE_SHOT);
	}






	/** public **/

	abort() {
		let rv = Components.results.NS_BINDING_ABORTED;
		if (this.xhr.httpchannel) this.xhr.httpchannel.cancel(rv);
	}

	get timeout() {return this.xhr.timeout};
	set timeout(v) {this.xhr.timeout = v};
	
	setRequestHeader(header, value) {
		this.xhr.headers[header] = value;
	}

	get readyState() {return this.xhr.readyState};

	open(method, url, async = true, user = "", password = "") {
		this.xhr.method = method;
		try {
			this.xhr.uri = Services.io.newURI(url);
		} catch (e) {
			Components.utils.reportError(e);
			throw new Error("Invalid URL <"+url+">");
		}
		this.xhr.async = async; //we should throw on false
		this.xhr.user = user;
		this.xhr.password = password;
		this.xhr.readyState = 1;
		this.onreadystatechange();
	}

	send(data) {
		console.log("Alternate XHR!");
		console.log("Data: " + data);
		let channel = Services.io.newChannelFromURI(
			this.xhr.uri,
			null,
			Services.scriptSecurityManager.createCodebasePrincipal(this.xhr.uri, { /* userContextId */ }),
			null,
			Components.interfaces.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
			Components.interfaces.nsIContentPolicy.TYPE_OTHER);

		this.xhr.httpchannel = channel.QueryInterface(Components.interfaces.nsIHttpChannel);
		this.xhr.httpchannel.loadFlags |= Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE;

		// notification callbacks are only needed, if you want to use the internal auth methods, that is
		// - not adding an Authentication header by yourself
		// - let the netwerk module run an unauthenticated request first
		// - let the netwerk module parse the returned WWW-Authentication header and pick an auth method
		// - let the netwerk module notify our notificationCallbacks that a password is required
		// - let the network module handle the auth process
		// special care needs to be taken of redirects, if notificationCallbacks is used
		// this.xhr.httpchannel.notificationCallbacks = aNotificationCallbacks;
		
		// Set default content type.
		if (!this.xhr.headers.hasOwnProperty("Content-Type")) {
		  this.xhr.headers["Content-Type"] = "application/xml; charset=utf-8";
		}
		
		// Set default accept value.
		if (!this.xhr.headers.hasOwnProperty("Accept")) {
		  this.xhr.headers["Accept"] = "*/*";
		}

		for (let header in this.xhr.headers) {
		  if (this.xhr.headers.hasOwnProperty(header)) {
			this.xhr.httpchannel.setRequestHeader(header, this.xhr.headers[header], false);
		  }
		}

		// if username and password have been specified, add Authorization header
		if (this.xhr.user && this.xhr.password) {
			this.xhr.httpchannel.setRequestHeader("Authorization", "Basic " + this._b64EncodeUnicode(this.username + ':' + this.password), false);
		}
		
		// Will overwrite the content-Type, so it must be called after the headers have been set.
		this._prepHttpChannelUploadData(this.xhr.httpchannel, this.xhr.method, data, this.xhr.headers["Content-Type"]);

		if (this.xhr.useStreamLoader) {
			let loader =  Components.classes["@mozilla.org/network/stream-loader;1"].createInstance(Components.interfaces.nsIStreamLoader);
			loader.init(this.listener);
			this.listener = loader;
		}        

		this._startTimeout();
		this.xhr.httpchannel.asyncOpen(this.listener, this.xhr.httpchannel);
	}

	get responseURL() {return this.xhr.httpchannel.URI.spec; }
	get responseText() {return this.xhr.responseText};
	get status() {return this.xhr.responseStatus};
	get statusText() {return this.xhr.responseStatusText};
	get channel() {return this.xhr.httpchannel};
	
	getResponseHeader(header) {
		try {
			return this.xhr.httpchannel.getResponseHeader(header);
		} catch (e) {
			console.log("Failed to get header <"+header+">");
		}
		return null;
	}
	
	
	
	

	/** todo **/

	get mozBackgroundRequest() {return this.xhr.mozBackgroundRequest};
	set mozBackgroundRequest(v) {this.xhr.mozBackgroundRequest = v};

	overrideMimeType(mime) {
		// silent ignore, no idea what this does
	}
	
	//redirects
	//handle Content-Length

	/* not used by cardbook */
	
	get responseXML() {throw new Error("responseXML not implemented");};

	get response() {throw new Error("response not implemented");};
	set response(v) {throw new Error("response not implemented");};

	get responseType() {throw new Error("response not implemented");};
	set responseType(v) {throw new Error("response not implemented");};

	get upload() {throw new Error("upload not implemented");};
	set upload(v) {throw new Error("upload not implemented");};

	get withCredentials() {throw new Error("withCredentials not implemented");};
	set withCredentials(v) {throw new Error("withCredentials not implemented");};

}
