import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins:[react()],
  server:{
    proxy:{
      "/assistant":{target:"http://localhost:11434",changeOrigin:true,rewrite:path=>path.replace(/^\\/assistant/,"")},\n      "/ollama":{
        target:"http://localhost:11434",
        changeOrigin:true,
        rewrite:path=>path.replace(/^\/ollama/,"")
      }
    }
  }
});
