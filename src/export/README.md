# Data Export Features

This module implements comprehensive data export functionality for compliance purposes, allowing users to export their data in various formats with job tracking capabilities.

## Features

### ✅ Implemented Features

1. **Multiple Export Formats**
   - CSV (Comma-separated values)
   - JSON (JavaScript Object Notation)
   - XML (eXtensible Markup Language)
   - XLSX (Microsoft Excel)

2. **Data Type Support**
   - Properties (property listings and information)
   - Transactions (transaction records and payment history)
   - Users (user account information - admin only)
   - User Activity (activity logs - admin only)
   - Audit Logs (system audit logs - admin only)
   - All Data (complete export - admin only)

3. **Export Job Tracking**
   - Real-time job status monitoring
   - Progress tracking with record counts
   - Error handling and reporting
   - Job cancellation support

4. **Compliance Features**
   - Audit logging for all export operations
   - Role-based access control
   - Date range limitations
   - Automatic file cleanup (7 days)
   - Data sanitization (removes sensitive information)

5. **Security & Rate Limiting**
   - Maximum 3 concurrent exports per user
   - Date range validation (1 year for users, 5 years for admins)
   - File access control
   - JWT authentication required

## API Endpoints

### Create Export Job
```
POST /api/v1/export
```

**Request Body:**
```json
{
  "dataType": "properties",
  "format": "csv",
  "startDate": "2023-01-01T00:00:00.000Z",
  "endDate": "2023-12-31T23:59:59.999Z",
  "fields": ["id", "title", "price", "createdAt"],
  "filters": {
    "status": "active"
  }
}
```

### Get Export Jobs
```
GET /api/v1/export?page=1&limit=10
```

### Get Export Job Details
```
GET /api/v1/export/{jobId}
```

### Cancel Export Job
```
POST /api/v1/export/{jobId}/cancel
```

### Download Export File
```
GET /api/v1/export/{jobId}/download
```

### Delete Export Job
```
DELETE /api/v1/export/{jobId}
```

### Get Available Formats
```
GET /api/v1/export/formats/available
```

### Get Available Data Types
```
GET /api/v1/export/data-types/available
```

## Export Job Status

- **pending**: Job created and queued for processing
- **processing**: Currently being processed
- **completed**: Export finished successfully
- **failed**: Export failed with error
- **cancelled**: Job was cancelled by user

## File Storage

- Export files are stored in the `exports/` directory
- Files are automatically cleaned up after 7 days
- File naming format: `{dataType}_{jobId}.{format}`

## Database Schema

The `ExportJob` model tracks all export operations:

```sql
CREATE TABLE "export_jobs" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "download_url" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "fields" JSONB,
    "filters" JSONB,
    "total_records" INTEGER DEFAULT 0,
    "file_size" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3)
);
```

## Queue Processing

Exports are processed asynchronously using Bull Queue:

- Queue name: `export-queue`
- Job name: `process-export`
- Retry attempts: 3
- Backoff strategy: Exponential

## Security Considerations

1. **Authentication**: All endpoints require valid JWT token
2. **Authorization**: Role-based access control for sensitive data
3. **Data Sanitization**: Passwords and sensitive fields are removed
4. **Audit Trail**: All export operations are logged
5. **Rate Limiting**: Prevents abuse with concurrent job limits
6. **File Access**: Files are only accessible by job owner

## Error Handling

- Validation errors return 400 status
- Authentication errors return 401 status
- Authorization errors return 403 status
- Not found errors return 404 status
- Server errors return 500 status

## Dependencies

- `@nestjs/bull`: Queue processing
- `bull`: Queue implementation
- `csv-writer`: CSV file generation
- `xml2js`: XML file generation
- `exceljs`: Excel file generation
- `uuid`: Unique identifier generation

## Testing

Run the test suite:

```bash
npm run test -- export
```

## Configuration

Environment variables (optional):

```bash
# Maximum export file size in bytes (default: 50MB)
EXPORT_MAX_FILE_SIZE=52428800

# Export file cleanup interval in hours (default: 7 days)
EXPORT_CLEANUP_HOURS=168

# Maximum concurrent exports per user (default: 3)
EXPORT_MAX_CONCURRENT=3
```

## Usage Examples

### Export Properties to CSV

```bash
curl -X POST http://localhost:3000/api/v1/export \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "properties",
    "format": "csv",
    "startDate": "2023-01-01T00:00:00.000Z",
    "endDate": "2023-12-31T23:59:59.999Z"
  }'
```

### Check Export Status

```bash
curl -X GET http://localhost:3000/api/v1/export/job123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Download Export File

```bash
curl -X GET http://localhost:3000/api/v1/export/job123/download \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  --output export.csv
```

## Compliance Notes

This implementation addresses GDPR/CCPA data portability requirements:

- **Data Portability**: Users can export their data in standard formats
- **Transparency**: All export operations are logged and trackable
- **Security**: Proper authentication and authorization controls
- **Retention**: Automatic cleanup prevents data accumulation
- **Access Control**: Role-based restrictions for sensitive data

## Future Enhancements

Potential improvements for future versions:

1. **Streaming Exports**: Support for large dataset streaming
2. **Compression**: Automatic file compression for large exports
3. **Scheduling**: Scheduled export jobs
4. **Email Notifications**: Email alerts when exports complete
5. **Export Templates**: Predefined export configurations
6. **Delta Exports**: Export only changed data since last export
7. **API Rate Limiting**: More granular rate limiting controls
8. **Export Analytics**: Usage statistics and monitoring
