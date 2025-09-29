#!/bin/bash

# Axiom AI Installation Script
# This script sets up the complete Axiom AI platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AXIOM_VERSION="1.0.0"
INSTALL_DIR="${INSTALL_DIR:-/opt/axiom-ai}"
DATA_DIR="${DATA_DIR:-/var/lib/axiom-ai}"
CONFIG_DIR="${CONFIG_DIR:-/etc/axiom-ai}"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    log_info "Checking system requirements..."
    
    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root for security reasons"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        log_info "Please install Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is required but not installed"
        log_info "Please install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 20+ is required but not installed"
        log_info "Please install Node.js: https://nodejs.org/"
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    if ! node -pe "process.exit(require('semver').gte('$NODE_VERSION', '20.0.0') ? 0 : 1)" 2>/dev/null; then
        log_error "Node.js 20.0.0 or higher is required (current: $NODE_VERSION)"
        exit 1
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git is required but not installed"
        exit 1
    fi
    
    log_success "All requirements met"
}

setup_directories() {
    log_info "Setting up directories..."
    
    # Create directories
    sudo mkdir -p "$INSTALL_DIR"
    sudo mkdir -p "$DATA_DIR"/{repos,cache,logs}
    sudo mkdir -p "$CONFIG_DIR"
    
    # Set permissions
    sudo chown -R $USER:$USER "$INSTALL_DIR"
    sudo chown -R $USER:$USER "$DATA_DIR"
    sudo chown -R $USER:$USER "$CONFIG_DIR"
    
    log_success "Directories created successfully"
}

clone_repository() {
    log_info "Cloning Axiom AI repository..."
    
    if [ -d "$INSTALL_DIR/.git" ]; then
        log_info "Repository already exists, pulling latest changes..."
        cd "$INSTALL_DIR"
        git pull origin main
    else
        git clone https://github.com/axiom-ai/axiom-ai.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    
    log_success "Repository cloned successfully"
}

setup_environment() {
    log_info "Setting up environment configuration..."
    
    # Copy example environment file
    if [ ! -f "$CONFIG_DIR/.env" ]; then
        cp "$INSTALL_DIR/.env.example" "$CONFIG_DIR/.env"
        log_warning "Please edit $CONFIG_DIR/.env with your configuration"
        log_warning "Required: Database passwords, API keys, and JWT secrets"
    fi
    
    # Generate secure secrets if not present
    if ! grep -q "JWT_SECRET=" "$CONFIG_DIR/.env" || grep -q "JWT_SECRET=your_jwt_secret_here" "$CONFIG_DIR/.env"; then
        JWT_SECRET=$(openssl rand -hex 32)
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$CONFIG_DIR/.env"
        log_info "Generated JWT secret"
    fi
    
    if ! grep -q "ENCRYPTION_KEY=" "$CONFIG_DIR/.env" || grep -q "ENCRYPTION_KEY=your_encryption_key_here" "$CONFIG_DIR/.env"; then
        ENCRYPTION_KEY=$(openssl rand -hex 32)
        sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" "$CONFIG_DIR/.env"
        log_info "Generated encryption key"
    fi
    
    # Create symlink to config in install directory
    ln -sf "$CONFIG_DIR/.env" "$INSTALL_DIR/.env"
    
    log_success "Environment configuration ready"
}

install_dependencies() {
    log_info "Installing dependencies..."
    
    cd "$INSTALL_DIR"
    
    # Install root dependencies
    npm install
    
    # Install service dependencies
    for service in services/*/; do
        if [ -f "$service/package.json" ]; then
            log_info "Installing dependencies for $(basename "$service")"
            cd "$service"
            npm install
            cd "$INSTALL_DIR"
        fi
    done
    
    log_success "Dependencies installed successfully"
}

build_services() {
    log_info "Building services..."
    
    cd "$INSTALL_DIR"
    
    # Build each service
    for service in services/*/; do
        if [ -f "$service/package.json" ] && [ -f "$service/tsconfig.json" ]; then
            log_info "Building $(basename "$service")"
            cd "$service"
            npm run build
            cd "$INSTALL_DIR"
        fi
    done
    
    log_success "Services built successfully"
}

setup_database() {
    log_info "Setting up database..."
    
    cd "$INSTALL_DIR"
    
    # Start PostgreSQL and Redis
    docker-compose up -d postgres redis
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 10
    
    # Run database migrations
    cd services/web-portal
    npx prisma generate
    npx prisma db push
    
    log_success "Database setup completed"
}

create_systemd_services() {
    log_info "Creating systemd services..."
    
    # Create systemd service files
    sudo tee /etc/systemd/system/axiom-ai.service > /dev/null <<EOF
[Unit]
Description=Axiom AI Platform
After=network.target docker.service
Requires=docker.service

[Service]
Type=forking
User=$USER
Group=$USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable axiom-ai
    
    log_success "Systemd services created"
}

start_services() {
    log_info "Starting Axiom AI services..."
    
    cd "$INSTALL_DIR"
    
    # Start all services
    docker-compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to start..."
    sleep 30
    
    # Check service health
    services=("web-portal:3000" "search-api:4000" "crawler-agent:4001" "security-scanner:4002" "mcp-server:5000")
    
    for service in "${services[@]}"; do
        name="${service%:*}"
        port="${service#*:}"
        
        if curl -s -f "http://localhost:$port/health" > /dev/null; then
            log_success "$name is healthy"
        else
            log_warning "$name may not be ready yet"
        fi
    done
    
    log_success "Services started successfully"
}

print_success_message() {
    log_success "Axiom AI installation completed successfully!"
    echo
    echo "🎉 Welcome to Axiom AI Platform!"
    echo
    echo "📊 Web Portal: http://localhost:3000"
    echo "🔍 Search API: http://localhost:4000"
    echo "🤖 MCP Server: http://localhost:5000"
    echo "📚 API Documentation: http://localhost:4000/docs"
    echo
    echo "📁 Installation Directory: $INSTALL_DIR"
    echo "📁 Data Directory: $DATA_DIR"
    echo "📁 Configuration: $CONFIG_DIR/.env"
    echo
    echo "🔧 Management Commands:"
    echo "  Start:   sudo systemctl start axiom-ai"
    echo "  Stop:    sudo systemctl stop axiom-ai"
    echo "  Status:  sudo systemctl status axiom-ai"
    echo "  Logs:    docker-compose -f $INSTALL_DIR/docker-compose.yml logs -f"
    echo
    echo "📖 Documentation: https://docs.axiom.ai"
    echo "💬 Support: https://github.com/axiom-ai/axiom-ai/issues"
    echo
    echo "⚠️  Next Steps:"
    echo "1. Configure your API keys in $CONFIG_DIR/.env"
    echo "2. Create your first workspace at http://localhost:3000"
    echo "3. Set up IDE integration with MCP server"
    echo
}

# Main installation flow
main() {
    echo "🚀 Axiom AI Platform Installer v$AXIOM_VERSION"
    echo "=============================================="
    echo
    
    check_requirements
    setup_directories
    clone_repository
    setup_environment
    install_dependencies
    build_services
    setup_database
    create_systemd_services
    start_services
    print_success_message
}

# Handle script interruption
trap 'log_error "Installation interrupted"; exit 1' INT TERM

# Run main function
main "$@"
