FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9.9-eclipse-temurin-21-alpine AS backend-build
WORKDIR /app
# Dependencies first, in their own layer: it is reused until pom.xml changes, so code-only
# deploys download nothing. They come from Google's Maven Central mirror (see the settings file).
COPY backend/pom.xml ./backend/pom.xml
COPY backend/.mvn/settings-docker.xml ./backend/.mvn/settings-docker.xml
RUN mvn -B -s backend/.mvn/settings-docker.xml -f backend/pom.xml dependency:go-offline
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist/ ./backend/src/main/resources/static/
RUN mvn -B -s backend/.mvn/settings-docker.xml -f backend/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
COPY --from=backend-build /app/backend/target/referral-portal-backend-0.0.1-SNAPSHOT.jar ./app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]