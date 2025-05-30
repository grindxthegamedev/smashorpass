# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /workspace

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Directly copy the service account key to the workspace root
COPY config/serviceAccountKey.json /workspace/serviceAccountKey.json

# Set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the new path
ENV GOOGLE_APPLICATION_CREDENTIALS=/workspace/serviceAccountKey.json

# Bundle app source
COPY . .

# Define the command to run your app
CMD [ "node", "index.js" ] 