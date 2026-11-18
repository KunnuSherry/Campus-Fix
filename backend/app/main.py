import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app.config import settings
from app.routes import auth, admin, documents, assist, reports, community, insights

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("campusfix_api")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="CampusFix Autonomous Multi-College Platform Backend (FastAPI + Groq/Qwen + Firebase + Resend)"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Validation Exception Handler (Log exact 422 causes)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"422 Validation error on {request.method} {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()}
    )

# Global Exception Handler (Never expose raw exceptions or internal stack traces to users)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Something went wrong on our end. Please try again."}
    )

# Routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(documents.router)
app.include_router(assist.router)
app.include_router(reports.router)
app.include_router(community.router)
app.include_router(insights.router)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "CampusFix API",
        "environment": settings.ENVIRONMENT,
        "active_groq_keys": len(settings.groq_keys),
        "groq_model": settings.GROQ_MODEL
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)

