"""Capa de infraestructura: adaptadores hacia servicios externos.

Único lugar (junto al composition root) donde se permite el acoplamiento
con implementaciones concretas — HTTP, credenciales, sesiones.
"""

from .memoria import AdaptadorInMemory
from .ucacue_api import DEFAULT_API_URL, AdaptadorApiUcacue, api_get

__all__ = ["DEFAULT_API_URL", "AdaptadorApiUcacue", "AdaptadorInMemory", "api_get"]
