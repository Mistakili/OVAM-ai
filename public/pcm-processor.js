class PCMProcessor extends AudioWorkletProcessor{
  constructor(){
    super();
    this.buffer=new Int16Array(1600); // 100ms at 16kHz
    this.offset=0;
  }
  process(inputs){
    const channel=inputs[0]?.[0];
    if(!channel)return true;
    for(let i=0;i<channel.length;i++){
      const s=Math.max(-1,Math.min(1,channel[i]));
      this.buffer[this.offset++]=s<0?s*0x8000:s*0x7fff;
      if(this.offset===this.buffer.length){
        let sum=0;
        for(let j=0;j<this.buffer.length;j++){
          const v=this.buffer[j]/0x8000;
          sum+=v*v;
        }
        this.port.postMessage({
          pcm:this.buffer.slice().buffer,
          level:Math.min(1,Math.sqrt(sum/this.buffer.length)*3)
        },[this.buffer.slice().buffer]);
        this.offset=0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-processor",PCMProcessor);