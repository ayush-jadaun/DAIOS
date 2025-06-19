FROM node:20-bullseye

# Install Python, pip, build-essential (GCC, G++, make), and OpenMP
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 python3-pip \
        build-essential \
        gcc g++ \
        libomp-dev \
    && rm -rf /var/lib/apt/lists/*

# Optional: Install other JS/TS tools globally if needed
# RUN npm install -g typescript eslint prettier ...

# Set working directory
WORKDIR /app

# Copy your application code
COPY . .

# Install Node.js dependencies
RUN npm install

# Set default sandbox directory for execution
RUN mkdir -p /app/sandbox

# Default command (can be overridden by docker-compose)
CMD ["node", "agentsEntry/devAgentEntry.js"]