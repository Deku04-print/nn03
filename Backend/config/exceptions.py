from rest_framework.views import exception_handler
from rest_framework.response import Response

def worklens_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        response.data = {
            'success': False,
            'error': {
                'code': str(type(exc).__name__).upper(),
                'message': str(exc),
            }
        }
    return response
