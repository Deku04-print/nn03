

from django.contrib import admin
from .models import ProblemDNA


@admin.register(ProblemDNA)
class ProblemDNAAdmin(admin.ModelAdmin):
    list_display = ('id', 'language', 'category', 'error_type', 'verification_status', 'created_at')
    list_filter = ('language', 'category', 'verification_status')
    search_fields = ('root_cause', 'code_pattern', 'category')
    readonly_fields = ('id', 'created_at', 'updated_at')
    ordering = ('-created_at',)

