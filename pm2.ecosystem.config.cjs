module.exports = {
  apps: [
    {
      name: "about-demo-api",
      cwd: __dirname,
      script: "apps/api/dist/server.js",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

