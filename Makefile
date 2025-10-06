.PHONY: up down build fmt lint sysctl

COMPOSE_CMD = docker compose --env-file .env -f infra/docker-compose.yml

up:      ## start local stack
	$(COMPOSE_CMD) up -d --build

down:    ## stop local stack
	$(COMPOSE_CMD) down -v

build:   ## build images
	$(COMPOSE_CMD) build
fmt:
	pre-commit run -a
lint:
	pre-commit run -a

sysctl:  ## configure vm.max_map_count for OpenSearch (requires Docker Desktop 4.24+)
	docker run --rm --privileged --pid=host alpine:3.20 sh -c 'sysctl -w vm.max_map_count=262144'
