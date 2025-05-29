# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /workspace

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Bundle app source
COPY . .

# Your app binds to port 3001 (or process.env.PORT)
# Cloud Run automatically uses the PORT env variable (default 8080)
# EXPOSE will be handled by Cloud Run based on the PORT your app listens to.

# Define the command to run your app
CMD [ "node", "index.js" ] 